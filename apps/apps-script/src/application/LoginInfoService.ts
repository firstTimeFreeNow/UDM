function afCreateLoginInfoService_(repository: AfLoginInfoRepository) {
  return {
    question(): { question: string } {
      repository.checkBoundSheet();
      return { question: repository.value('AF_LOGIN_INFO_QUESTION') };
    },
    reveal(answer: unknown): { email: string; password: string } {
      repository.checkBoundSheet();
      const expected = repository.value('AF_LOGIN_INFO_ANSWER');
      if (typeof answer !== 'string' || answer !== expected) throw new Error('答えが違います。');
      return {
        email: repository.value('AF_LOGIN_INFO_EMAIL'),
        password: repository.value('AF_LOGIN_INFO_PASSWORD'),
      };
    },
  };
}
