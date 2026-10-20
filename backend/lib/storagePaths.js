export function getAccountStoragePrefix(account) {
  if (!/^[a-f0-9-]{36}$/i.test(account?.id || ""))
    throw new Error("A valid account ID is required for storage");
  return `fussy-panda/${account.isGuest ? "guests" : "accounts"}/${account.id}`;
}
