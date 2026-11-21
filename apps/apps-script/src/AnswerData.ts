/**
 * メンバー設定・候補日時・回答表を計3回の範囲取得で読み出す。
 * 必要以上の再計算や Spreadsheet サービスへの往復を避ける。
 */
function loadAnswerContext_(): AfAnswerContext {
  const settings = sheet_(AF.members)
    .getRange(3, 1, AF.firstMemberRow + AF.memberCapacity - 3, 3)
    .getValues();
  const start = settings[0][1];
  if (!(start instanceof Date)) {
    throw new Error('対象週の開始日が不正です');
  }

  const members = settings
    .slice(AF.firstMemberRow - 3, AF.firstMemberRow - 3 + AF.memberCapacity)
    .map(afSheetMember_)
    .filter((member) => member.name && member.active);

  const slotValues = sheet_(AF.main)
    .getRange(AF.firstSlotRow, 1, AF.lastSlotRow - AF.firstSlotRow + 1, 2)
    .getValues();
  const slots = afSheetSlots_(slotValues);

  return {
    weekId: fmtDate_(start),
    members,
    slots,
    grid: adminAnswers_(),
    minParticipants: Number(settings[2][1]) || AF.minParticipants,
  };
}

function computeAnswerData_(): AfAnswerData {
  const startedAt = Date.now();
  const context = loadAnswerContext_();
  const { weekId, members, slots, grid, minParticipants } = context;
  const answers = Object.create(null);

  members.forEach((member) => {
    answers[member.name] = {};
  });

  const decoratedSlots = slots.map((slot) => {
    const values = grid[slot.row - AF.firstSlotRow];
    let count = 0;
    let requiredPresent = true;

    members.forEach((member) => {
      const answer = values[member.index];
      if (['○', '△', '×'].includes(answer)) {
        answers[member.name][slot.key] = answer;
      }
      if (answer === '○') {
        count++;
      } else if (member.required) {
        requiredPresent = false;
      }
    });

    let judgment: AfModels['Slot']['judgment'] = '開催可能';
    if (!requiredPresent) {
      judgment = '必須未達';
    } else if (count < minParticipants) {
      judgment = '人数不足';
    } else if (count > AF.maxParticipants) {
      judgment = '人数調整';
    }
    return { ...slot, count, judgment };
  });

  const durationMs = Date.now() - startedAt;
  console.log('getAnswerData.serverMs=' + durationMs);

  return {
    weekId,
    members: members.map((member) => ({ name: member.name, required: member.required })),
    slots: decoratedSlots,
    answers,
    metrics: { serverMs: durationMs },
  };
}

/**
 * 通常はキャッシュを優先し、強制更新では管理用シートから取得する。
 * 計測時はforceRefresh=trueにしてキャッシュによる測定誤差を避ける。
 */
function afGetAnswerData_(forceRefresh = false): AfAnswerData {
  const startedAt = Date.now();
  if (!forceRefresh) {
    const cached = cachedAnswerData_();
    if (cached) {
      console.log('getAnswerData.cacheHitMs=' + (Date.now() - startedAt));
      return cached;
    }
  }
  const data = computeAnswerData_();
  cacheAnswerData_(data);
  return data;
}
