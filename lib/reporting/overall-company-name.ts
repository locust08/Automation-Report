type TikTokAdvertiserIdentity = {
  advertiserId: string;
  advertiserName: string;
};

export function resolveOverallPerformanceCompanyName(input: {
  fallbackCompanyName: string;
  metaAccountIds: string[];
  googleAccountIds: string[];
  tiktokAccountIds: string[];
  tiktokAccounts: TikTokAdvertiserIdentity[];
}): string {
  const isTikTokOnly =
    input.tiktokAccountIds.length > 0 &&
    input.metaAccountIds.length === 0 &&
    input.googleAccountIds.length === 0;

  if (!isTikTokOnly) {
    return input.fallbackCompanyName;
  }

  const selectedAdvertiser = input.tiktokAccounts.find(
    (account) => input.tiktokAccountIds.includes(account.advertiserId)
  );

  return selectedAdvertiser?.advertiserName.trim() || input.fallbackCompanyName;
}
