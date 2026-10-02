import { expect, it } from "vitest";
import { EMPTY_REPLY, replyIntent, restoreReply } from "./reply";

it("binds retries to all reply inputs, not just a page URL", () => {
  const first = { ...EMPTY_REPLY, comment: "怎么买" };
  expect(replyIntent(first)).not.toBe(replyIntent({ ...first, comment: "谢谢" }));
  expect(replyIntent(first)).not.toBe(replyIntent({ ...first, intent: "解释价格" }));
  expect(replyIntent(first)).toBe(replyIntent({ ...first, comment: " 怎么买 " }));
});
it("restores only this user's recent draft", () => {
  const saved = { userId: "one", input: EMPTY_REPLY, result: null, editedBody: "edited reply", savedAt: 1000 };
  expect(restoreReply(saved, "one", 2000)?.editedBody).toBe("edited reply");
  expect(restoreReply(saved, "two", 2000)).toBeNull();
  expect(restoreReply(saved, "one", 86_401_000)).toBeNull();
  expect(restoreReply({ ...saved, input: { platform: "xiaohongshu" } }, "one", 2000)).toBeNull();
});
