/**
 * Telegram handlers for the interview prep system: STAR+R Story Bank and
 * tagged Q&A bank.  Callback prefixes:
 *   ip:menu                — root interview-prep menu
 *   ip:s:list              — list stories
 *   ip:s:d:<short>         — story detail
 *   ip:s:add               — start adding a story (asks for title)
 *   ip:s:del:<short>       — delete a story (with confirm)
 *   ip:s:delc:<short>      — delete-confirm
 *   ip:q:list              — list questions
 *   ip:q:d:<short>         — question detail
 *   ip:q:add               — start adding a question
 *   ip:q:del:<short>       — delete with confirm
 *   ip:q:delc:<short>      — delete-confirm
 */

import { logger } from "@infra/logger";
import { InlineKeyboard, type Bot, type Context } from "grammy";
import * as repo from "../../../repositories/interview-prep";
import { awaitingInput } from "../awaiting-input";
import { escapeHtml } from "../formatting";

const PAGE_SIZE = 8;

function shortId(id: string): string {
  return id.slice(0, 8);
}

async function resolveStoryByShortId(short: string) {
  const stories = await repo.listStories(200);
  return stories.find((s) => shortId(s.id) === short) ?? null;
}

async function resolveQuestionByShortId(short: string) {
  const questions = await repo.listQuestions(200);
  return questions.find((q) => shortId(q.id) === short) ?? null;
}

function formatStoryDetail(story: repo.InterviewStory): string {
  const lines: string[] = [];
  lines.push(`<b>📘 ${escapeHtml(story.title)}</b>`);
  if (story.isMaster) lines.push("⭐ <i>Master story</i>");
  if (story.tags.length > 0)
    lines.push(`🏷 ${story.tags.map((t) => `#${escapeHtml(t)}`).join(" ")}`);
  lines.push("");
  if (story.situation) {
    lines.push(`<b>S:</b> ${escapeHtml(story.situation)}`);
  }
  if (story.task) {
    lines.push(`<b>T:</b> ${escapeHtml(story.task)}`);
  }
  if (story.action) {
    lines.push(`<b>A:</b> ${escapeHtml(story.action)}`);
  }
  if (story.result) {
    lines.push(`<b>R:</b> ${escapeHtml(story.result)}`);
  }
  if (story.reflection) {
    lines.push(`<b>+R (reflection):</b> ${escapeHtml(story.reflection)}`);
  }
  lines.push("");
  lines.push(`<i>Used ${story.timesUsed} times</i>`);
  return lines.join("\n");
}

function formatQuestionDetail(q: repo.InterviewQuestion): string {
  const lines: string[] = [];
  lines.push(`<b>❓ ${escapeHtml(q.question)}</b>`);
  if (q.sourceCompany)
    lines.push(`🏢 ${escapeHtml(q.sourceCompany)}`);
  if (q.tags.length > 0)
    lines.push(`🏷 ${q.tags.map((t) => `#${escapeHtml(t)}`).join(" ")}`);
  lines.push(`💪 Confidence: ${"⭐".repeat(Math.max(1, Math.min(5, q.confidence)))}`);
  lines.push("");
  if (q.answer) {
    lines.push(`<b>Answer:</b>\n${escapeHtml(q.answer)}`);
  } else {
    lines.push("<i>No answer recorded yet. Send /ip-a to add one.</i>");
  }
  return lines.join("\n");
}

async function showInterviewMenu(ctx: Context): Promise<void> {
  const [stories, questions] = await Promise.all([
    repo.listStories(200),
    repo.listQuestions(200),
  ]);
  const masters = stories.filter((s) => s.isMaster).length;
  const text =
    `<b>🎤 Interview Prep</b>\n\n` +
    `📘 Stories: ${stories.length} (⭐ ${masters} master)\n` +
    `❓ Questions: ${questions.length}\n\n` +
    `Build a STAR+R story bank and a tagged question bank that you can pull from before any interview.`;
  const keyboard = new InlineKeyboard()
    .text("📘 Stories", "ip:s:list:0")
    .text("❓ Questions", "ip:q:list:0")
    .row()
    .text("➕ Add Story", "ip:s:add")
    .text("➕ Add Question", "ip:q:add")
    .row()
    .text("◀️ Menu", "m:menu");
  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
  }
}

export function registerInterviewPrepHandlers(bot: Bot): void {
  bot.command("interview", showInterviewMenu);
  bot.command("ip", showInterviewMenu);

  bot.callbackQuery("ip:menu", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showInterviewMenu(ctx);
  });

  // ---------- Stories ----------

  bot.callbackQuery(/^ip:s:list:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const page = parseInt(ctx.match![1], 10);
    const stories = await repo.listStories(200);
    const totalPages = Math.max(1, Math.ceil(stories.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages - 1);
    const slice = stories.slice(
      safePage * PAGE_SIZE,
      (safePage + 1) * PAGE_SIZE,
    );

    const lines: string[] = [`<b>📘 Story Bank (${stories.length})</b>`, ""];
    if (slice.length === 0) {
      lines.push(
        "Empty so far. Tap <b>➕ Add Story</b> to record your first STAR+R story.",
      );
    } else {
      slice.forEach((s, idx) => {
        const star = s.isMaster ? "⭐ " : "";
        lines.push(
          `${safePage * PAGE_SIZE + idx + 1}. ${star}${escapeHtml(s.title)}`,
        );
      });
    }

    const keyboard = new InlineKeyboard();
    for (const s of slice) {
      const star = s.isMaster ? "⭐" : "📘";
      keyboard
        .text(`${star} ${s.title.slice(0, 40)}`, `ip:s:d:${shortId(s.id)}`)
        .row();
    }
    if (safePage > 0) keyboard.text("◀️", `ip:s:list:${safePage - 1}`);
    keyboard.text(`${safePage + 1}/${totalPages}`, "noop");
    if (safePage < totalPages - 1)
      keyboard.text("▶️", `ip:s:list:${safePage + 1}`);
    keyboard
      .row()
      .text("➕ Add Story", "ip:s:add")
      .text("◀️ Back", "ip:menu");

    await ctx.editMessageText(lines.join("\n"), {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  });

  bot.callbackQuery(/^ip:s:d:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const story = await resolveStoryByShortId(ctx.match![1]);
    if (!story) {
      await ctx.editMessageText("Story not found.");
      return;
    }
    const keyboard = new InlineKeyboard()
      .text(
        story.isMaster ? "⭐ Unmark Master" : "⭐ Mark Master",
        `ip:s:m:${shortId(story.id)}`,
      )
      .text("✅ Mark Used", `ip:s:u:${shortId(story.id)}`)
      .row()
      .text("🗑 Delete", `ip:s:del:${shortId(story.id)}`)
      .row()
      .text("◀️ Stories", "ip:s:list:0");
    await ctx.editMessageText(formatStoryDetail(story), {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  });

  bot.callbackQuery(/^ip:s:m:(.+)$/, async (ctx) => {
    const story = await resolveStoryByShortId(ctx.match![1]);
    if (!story) {
      await ctx.answerCallbackQuery("Not found");
      return;
    }
    await repo.updateStory(story.id, { isMaster: !story.isMaster });
    await ctx.answerCallbackQuery(
      story.isMaster ? "⭐ Unmarked" : "⭐ Marked as master",
    );
    const refreshed = await repo.getStoryById(story.id);
    if (refreshed) {
      const keyboard = new InlineKeyboard()
        .text(
          refreshed.isMaster ? "⭐ Unmark Master" : "⭐ Mark Master",
          `ip:s:m:${shortId(refreshed.id)}`,
        )
        .text("✅ Mark Used", `ip:s:u:${shortId(refreshed.id)}`)
        .row()
        .text("🗑 Delete", `ip:s:del:${shortId(refreshed.id)}`)
        .row()
        .text("◀️ Stories", "ip:s:list:0");
      await ctx
        .editMessageText(formatStoryDetail(refreshed), {
          parse_mode: "HTML",
          reply_markup: keyboard,
        })
        .catch(() => {});
    }
  });

  bot.callbackQuery(/^ip:s:u:(.+)$/, async (ctx) => {
    const story = await resolveStoryByShortId(ctx.match![1]);
    if (!story) {
      await ctx.answerCallbackQuery("Not found");
      return;
    }
    await repo.updateStory(story.id, { timesUsed: story.timesUsed + 1 });
    await ctx.answerCallbackQuery(`Used count → ${story.timesUsed + 1}`);
  });

  bot.callbackQuery(/^ip:s:del:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const story = await resolveStoryByShortId(ctx.match![1]);
    if (!story) {
      await ctx.editMessageText("Story not found.");
      return;
    }
    const keyboard = new InlineKeyboard()
      .text("🗑 Confirm Delete", `ip:s:delc:${shortId(story.id)}`)
      .text("Cancel", `ip:s:d:${shortId(story.id)}`);
    await ctx.editMessageText(
      `Delete story <b>${escapeHtml(story.title)}</b>?`,
      { parse_mode: "HTML", reply_markup: keyboard },
    );
  });

  bot.callbackQuery(/^ip:s:delc:(.+)$/, async (ctx) => {
    const story = await resolveStoryByShortId(ctx.match![1]);
    if (!story) {
      await ctx.answerCallbackQuery("Not found");
      return;
    }
    await repo.deleteStory(story.id);
    await ctx.answerCallbackQuery("🗑 Deleted");
    await ctx.editMessageText(`🗑 Deleted: ${escapeHtml(story.title)}`, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("◀️ Stories", "ip:s:list:0"),
    });
  });

  bot.callbackQuery("ip:s:add", async (ctx) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    awaitingInput.set(chatId, "ip:story:title");
    await ctx.editMessageText(
      "📘 <b>New Story</b>\n\nSend a short title (e.g. <i>Migrated billing service to Postgres in 2 weeks</i>).\nSend /cancel to abort.",
      { parse_mode: "HTML" },
    );
  });

  // ---------- Questions ----------

  bot.callbackQuery(/^ip:q:list:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const page = parseInt(ctx.match![1], 10);
    const questions = await repo.listQuestions(200);
    const totalPages = Math.max(1, Math.ceil(questions.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages - 1);
    const slice = questions.slice(
      safePage * PAGE_SIZE,
      (safePage + 1) * PAGE_SIZE,
    );

    const lines: string[] = [
      `<b>❓ Question Bank (${questions.length})</b>`,
      "",
    ];
    if (slice.length === 0) {
      lines.push(
        "Empty so far. Tap <b>➕ Add Question</b> to record your first interview question.",
      );
    } else {
      slice.forEach((q, idx) => {
        const company = q.sourceCompany ? ` [${q.sourceCompany}]` : "";
        lines.push(
          `${safePage * PAGE_SIZE + idx + 1}. ${escapeHtml(q.question.slice(0, 80))}${escapeHtml(company)}`,
        );
      });
    }

    const keyboard = new InlineKeyboard();
    for (const q of slice) {
      keyboard
        .text(
          `❓ ${q.question.slice(0, 40)}`,
          `ip:q:d:${shortId(q.id)}`,
        )
        .row();
    }
    if (safePage > 0) keyboard.text("◀️", `ip:q:list:${safePage - 1}`);
    keyboard.text(`${safePage + 1}/${totalPages}`, "noop");
    if (safePage < totalPages - 1)
      keyboard.text("▶️", `ip:q:list:${safePage + 1}`);
    keyboard
      .row()
      .text("➕ Add Question", "ip:q:add")
      .text("◀️ Back", "ip:menu");

    await ctx.editMessageText(lines.join("\n"), {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  });

  bot.callbackQuery(/^ip:q:d:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const q = await resolveQuestionByShortId(ctx.match![1]);
    if (!q) {
      await ctx.editMessageText("Question not found.");
      return;
    }
    const keyboard = new InlineKeyboard()
      .text("📈 +Confidence", `ip:q:c+:${shortId(q.id)}`)
      .text("📉 -Confidence", `ip:q:c-:${shortId(q.id)}`)
      .row()
      .text("🗑 Delete", `ip:q:del:${shortId(q.id)}`)
      .row()
      .text("◀️ Questions", "ip:q:list:0");
    await ctx.editMessageText(formatQuestionDetail(q), {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  });

  bot.callbackQuery(/^ip:q:c([+-]):(.+)$/, async (ctx) => {
    const direction = ctx.match![1];
    const q = await resolveQuestionByShortId(ctx.match![2]);
    if (!q) {
      await ctx.answerCallbackQuery("Not found");
      return;
    }
    const next = Math.max(
      1,
      Math.min(5, q.confidence + (direction === "+" ? 1 : -1)),
    );
    await repo.updateQuestion(q.id, { confidence: next });
    await ctx.answerCallbackQuery(`Confidence → ${next}/5`);
  });

  bot.callbackQuery(/^ip:q:del:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const q = await resolveQuestionByShortId(ctx.match![1]);
    if (!q) {
      await ctx.editMessageText("Question not found.");
      return;
    }
    const keyboard = new InlineKeyboard()
      .text("🗑 Confirm Delete", `ip:q:delc:${shortId(q.id)}`)
      .text("Cancel", `ip:q:d:${shortId(q.id)}`);
    await ctx.editMessageText(
      `Delete question?\n\n<i>${escapeHtml(q.question)}</i>`,
      { parse_mode: "HTML", reply_markup: keyboard },
    );
  });

  bot.callbackQuery(/^ip:q:delc:(.+)$/, async (ctx) => {
    const q = await resolveQuestionByShortId(ctx.match![1]);
    if (!q) {
      await ctx.answerCallbackQuery("Not found");
      return;
    }
    await repo.deleteQuestion(q.id);
    await ctx.answerCallbackQuery("🗑 Deleted");
    await ctx.editMessageText("🗑 Question deleted.", {
      reply_markup: new InlineKeyboard().text("◀️ Questions", "ip:q:list:0"),
    });
  });

  bot.callbackQuery("ip:q:add", async (ctx) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    awaitingInput.set(chatId, "ip:question:question");
    await ctx.editMessageText(
      "❓ <b>New Question</b>\n\nSend the interview question text. Send /cancel to abort.",
      { parse_mode: "HTML" },
    );
  });

  // ---------- Awaiting-input message handler ----------

  bot.on("message:text", async (ctx, next) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return next();
    const action = awaitingInput.get(chatId);
    if (!action || !action.startsWith("ip:")) return next();

    const text = ctx.message.text.trim();
    if (text === "/cancel") {
      awaitingInput.delete(chatId);
      await ctx.reply("Cancelled.");
      return;
    }

    try {
      if (action === "ip:story:title") {
        const story = await repo.createStory({ title: text });
        awaitingInput.set(chatId, `ip:story:situation:${story.id}`);
        await ctx.reply(
          "✅ Title saved. Now send the <b>Situation</b> (1-2 sentences). Send <code>-</code> to skip.",
          { parse_mode: "HTML" },
        );
        return;
      }
      if (action.startsWith("ip:story:situation:")) {
        const id = action.substring("ip:story:situation:".length);
        await repo.updateStory(id, { situation: text === "-" ? "" : text });
        awaitingInput.set(chatId, `ip:story:task:${id}`);
        await ctx.reply(
          "Send the <b>Task</b> (what needed to be done). Send <code>-</code> to skip.",
          { parse_mode: "HTML" },
        );
        return;
      }
      if (action.startsWith("ip:story:task:")) {
        const id = action.substring("ip:story:task:".length);
        await repo.updateStory(id, { task: text === "-" ? "" : text });
        awaitingInput.set(chatId, `ip:story:action:${id}`);
        await ctx.reply(
          "Send the <b>Action</b> (what YOU did). Send <code>-</code> to skip.",
          { parse_mode: "HTML" },
        );
        return;
      }
      if (action.startsWith("ip:story:action:")) {
        const id = action.substring("ip:story:action:".length);
        await repo.updateStory(id, { action: text === "-" ? "" : text });
        awaitingInput.set(chatId, `ip:story:result:${id}`);
        await ctx.reply(
          "Send the <b>Result</b> (measurable impact). Send <code>-</code> to skip.",
          { parse_mode: "HTML" },
        );
        return;
      }
      if (action.startsWith("ip:story:result:")) {
        const id = action.substring("ip:story:result:".length);
        await repo.updateStory(id, { result: text === "-" ? "" : text });
        awaitingInput.set(chatId, `ip:story:reflection:${id}`);
        await ctx.reply(
          "Send the <b>Reflection</b> (what you'd do differently — shows seniority). Send <code>-</code> to skip.",
          { parse_mode: "HTML" },
        );
        return;
      }
      if (action.startsWith("ip:story:reflection:")) {
        const id = action.substring("ip:story:reflection:".length);
        await repo.updateStory(id, {
          reflection: text === "-" ? "" : text,
        });
        awaitingInput.delete(chatId);
        const story = await repo.getStoryById(id);
        if (story) {
          await ctx.reply(
            `✅ Story saved.\n\n${formatStoryDetail(story)}`,
            {
              parse_mode: "HTML",
              reply_markup: new InlineKeyboard().text(
                "📘 Stories",
                "ip:s:list:0",
              ),
            },
          );
        }
        return;
      }

      if (action === "ip:question:question") {
        const q = await repo.createQuestion({ question: text });
        awaitingInput.set(chatId, `ip:question:answer:${q.id}`);
        await ctx.reply(
          "Question saved. Send your <b>answer</b> (or <code>-</code> to skip and add later).",
          { parse_mode: "HTML" },
        );
        return;
      }
      if (action.startsWith("ip:question:answer:")) {
        const id = action.substring("ip:question:answer:".length);
        await repo.updateQuestion(id, { answer: text === "-" ? "" : text });
        awaitingInput.set(chatId, `ip:question:tags:${id}`);
        await ctx.reply(
          "Send tags as a space-separated list (e.g. <code>system-design behavioral</code>) or <code>-</code> to skip.",
          { parse_mode: "HTML" },
        );
        return;
      }
      if (action.startsWith("ip:question:tags:")) {
        const id = action.substring("ip:question:tags:".length);
        const tags =
          text === "-"
            ? []
            : text
                .split(/[\s,]+/)
                .map((t) => t.trim().toLowerCase())
                .filter(Boolean);
        await repo.updateQuestion(id, { tags });
        awaitingInput.delete(chatId);
        const q = await repo.getQuestionById(id);
        if (q) {
          await ctx.reply(`✅ Question saved.\n\n${formatQuestionDetail(q)}`, {
            parse_mode: "HTML",
            reply_markup: new InlineKeyboard().text(
              "❓ Questions",
              "ip:q:list:0",
            ),
          });
        }
        return;
      }
    } catch (err) {
      logger.error("Interview prep input handler error", {
        error: err instanceof Error ? err.message : String(err),
      });
      awaitingInput.delete(chatId);
      await ctx.reply("❌ Failed to save. Try again.");
    }
  });
}
