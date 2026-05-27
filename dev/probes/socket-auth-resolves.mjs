// PROBE: Verify socketlib binds `this.socketdata.userId` to the handler.
// Paste body into MCP evaluate (or Foundry console with await).
// Returns true if the auth-gate read site resolves the sender correctly.

const SDX = game.modules.get("shadowdark-extras");
if (!SDX?.socket) return { error: "module.socket not available" };

const probeName = "__sdxAuthResolveProbe";
SDX.socket.register(probeName, function(payload) {
  return {
    hasSocketdata: !!this?.socketdata,
    userId: this?.socketdata?.userId,
    senderIdLegacy: this?.senderId,  // should be undefined — the old bug
    thisKeys: Object.keys(this || {}),
  };
});

const result = await SDX.socket.executeAsGM(probeName, { hello: "world" });
return {
  pass: result?.userId === game.user.id && result?.senderIdLegacy === undefined,
  expectedUserId: game.user.id,
  result,
};
