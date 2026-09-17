/**
 * 内网 / 离线版本：不存在 Dyad 试用账号，也不再强制切换到 Dyad 云端 auto
 * 模型（该模型已从本版本移除）。
 *
 * 保留 hook 形状以兼容既有调用方。
 */
export function useTrialModelRestriction() {
  return {
    isTrial: false,
    isLoadingTrialStatus: false,
  };
}
