import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function TablePagination({
  label,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  label: string;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize)),
    current = Math.min(page, pages - 1);
  const go = (n: number) =>
    onPageChange(Math.max(0, Math.min(pages - 1, Math.trunc(n))));
  return (
    <nav
      aria-label={`${label}のページ切替`}
      className="flex flex-wrap items-center justify-between gap-3 text-xs"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span>
          {total === 0 ? 0 : current * pageSize + 1}〜
          {Math.min(total, (current + 1) * pageSize)}件 / 全
          {total.toLocaleString("ja-JP")}件
        </span>
        <label className="flex items-center gap-1">
          <span>表示件数</span>
          <select
            className="planner-select !w-20"
            aria-label={`${label} 表示件数`}
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {[10, 20, 50, 100].map((n) => (
              <option value={n} key={n}>
                {n}件
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <Button
          size="sm"
          variant="outline"
          disabled={current === 0}
          onClick={() => go(0)}
          aria-label={`${label} 最初のページ`}
        >
          最初
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={current === 0}
          onClick={() => go(current - 1)}
          aria-label={`${label} 前のページ`}
        >
          前へ
        </Button>
        <Input
          type="number"
          min={1}
          max={pages}
          value={current + 1}
          aria-label={`${label} ページ番号`}
          className="!h-8 !w-16 text-center"
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) go(n - 1);
          }}
        />
        <span className="mx-1">/ {pages.toLocaleString("ja-JP")}</span>
        <Button
          size="sm"
          variant="outline"
          disabled={current === pages - 1}
          onClick={() => go(current + 1)}
          aria-label={`${label} 次のページ`}
        >
          次へ
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={current === pages - 1}
          onClick={() => go(pages - 1)}
          aria-label={`${label} 最後のページ`}
        >
          最後
        </Button>
      </div>
    </nav>
  );
}
