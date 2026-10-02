import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgentQuestionCard } from "@/components/app-shell/AgentQuestionCard";
import {
  askUserRequestSchema,
  buildAskUserAnswer,
  looksLikeNumberedChoiceQuestion,
  orderAskUserOptionsForLocale,
  parseAskUserResult,
  platformRegionOfLabel
} from "@/lib/agent/ask-user";

const questions = [
  {
    id: "platform",
    question: "先发哪个平台？",
    options: [
      { label: "小红书", description: "图文种草，适合冷启动" },
      { label: "公众号", description: "长文沉淀，适合深度" }
    ],
    recommended: "小红书"
  },
  {
    id: "tone",
    question: "语气用哪种？",
    options: [{ label: "专业" }, { label: "轻松" }]
  }
];

describe("ask_user schema", () => {
  it("rejects more than one question in one turn", () => {
    const tooMany = Array.from({ length: 2 }, (_, index) => ({
      id: `q${index}`,
      question: `问题 ${index}`,
      options: [{ label: "A" }, { label: "B" }]
    }));
    expect(askUserRequestSchema.safeParse({ questions: tooMany }).success).toBe(false);
  });

  it("rejects a recommended label that is not one of the options", () => {
    const parsed = askUserRequestSchema.safeParse({
      questions: [
        { id: "goal", question: "目标是什么？", options: [{ label: "涨粉" }, { label: "转化" }], recommended: "随便" }
      ]
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts a well-formed ask_user tool result", () => {
    expect(parseAskUserResult({ askedUser: true, questions })).not.toBeNull();
    expect(parseAskUserResult({ askedUser: true })).toBeNull();
  });
});

describe("looksLikeNumberedChoiceQuestion", () => {
  it("matches the numbered-list reply the agent should have sent as options", () => {
    expect(looksLikeNumberedChoiceQuestion(
      "请告诉我你想做哪一个？\n1. 逆袭故事\n2. 避坑指南\n3. 招生官内幕\n选定后我会继续。"
    )).toBe(true);
    expect(looksLikeNumberedChoiceQuestion("三个方向都可以，你选一个后我继续：\n1、小红书图文\n2、公众号长文")).toBe(true);
  });

  it("ignores numbered step lists without a choice question", () => {
    expect(looksLikeNumberedChoiceQuestion("已保存。接下来的步骤：\n1. 调研选题\n2. 生成图文\n3. 发布前检查")).toBe(false);
  });

  it("ignores open questions without numbered options and empty text", () => {
    expect(looksLikeNumberedChoiceQuestion("你想做什么内容？请告诉我你的想法。")).toBe(false);
    expect(looksLikeNumberedChoiceQuestion("")).toBe(false);
  });
});

describe("buildAskUserAnswer", () => {  it("maps each pick back to its question", () => {
    const answer = buildAskUserAnswer(
      [
        { question: questions[0], labels: ["小红书"] },
        { question: questions[1], labels: ["专业"] }
      ],
      "zh"
    );
    expect(answer).toBe("我已选择「小红书」。请直接继续完成任务，不要重复提问。问题是：先发哪个平台？\n我已选择「专业」。请直接继续完成任务，不要重复提问。问题是：语气用哪种？");
  });

  it("joins multi-select labels and skips unanswered questions", () => {
    const answer = buildAskUserAnswer(
      [
        { question: questions[0], labels: ["小红书", "公众号"] },
        { question: questions[1], labels: [] }
      ],
      "zh"
    );
    expect(answer).toBe("我已选择「小红书、公众号」。请直接继续完成任务，不要重复提问。问题是：先发哪个平台？");
  });
});

describe("AgentQuestionCard", () => {
  it("renders questions, options, and the recommended tag", () => {
    render(<AgentQuestionCard questions={questions} locale="zh" interactive />);

    expect(screen.getByText("先发哪个平台？")).toBeInTheDocument();
    expect(screen.getByText("图文种草，适合冷启动")).toBeInTheDocument();
    expect(screen.getByText("推荐")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /发送选择/ })).toBeDisabled();
  });

  it("sends the picked options back as one user message", () => {
    const onAnswer = vi.fn();
    render(<AgentQuestionCard questions={questions} locale="zh" interactive onAnswer={onAnswer} />);

    fireEvent.click(screen.getByText("小红书"));
    fireEvent.click(screen.getByText("专业"));
    fireEvent.click(screen.getByRole("button", { name: /发送选择/ }));

    expect(onAnswer).toHaveBeenCalledWith(
      "我已选择「小红书」。请直接继续完成任务，不要重复提问。问题是：先发哪个平台？\n我已选择「专业」。请直接继续完成任务，不要重复提问。问题是：语气用哪种？"
    );
    expect(screen.getByText("选择已发送，正在继续任务")).toBeInTheDocument();
  });

  it("supports multi-select toggling", () => {
    const onAnswer = vi.fn();
    const multi = [
      {
        id: "platform",
        question: "发哪些平台？",
        options: [{ label: "小红书" }, { label: "公众号" }],
        multiple: true
      }
    ];
    render(<AgentQuestionCard questions={multi} locale="zh" interactive onAnswer={onAnswer} />);

    fireEvent.click(screen.getByText("小红书"));
    fireEvent.click(screen.getByText("公众号"));
    fireEvent.click(screen.getByText("公众号"));
    fireEvent.click(screen.getByRole("button", { name: /发送选择/ }));

    expect(onAnswer).toHaveBeenCalledWith("我已选择「小红书」。请直接继续完成任务，不要重复提问。问题是：发哪些平台？");
  });

  it("submits a single-choice card immediately after one tap", () => {
    const onAnswer = vi.fn();
    render(<AgentQuestionCard questions={[questions[0]]} locale="zh" interactive onAnswer={onAnswer} />);

    expect(screen.getByText("点选后会立即继续，无需再输入“继续”")).toBeInTheDocument();
    fireEvent.click(screen.getByText("小红书"));

    expect(onAnswer).toHaveBeenCalledWith(
      "我已选择「小红书」。请直接继续完成任务，不要重复提问。问题是：先发哪个平台？"
    );
    expect(screen.getByText("选择已发送，正在继续任务")).toBeInTheDocument();
  });

  it("renders restored history read-only", () => {
    const onAnswer = vi.fn();
    render(<AgentQuestionCard questions={questions} locale="zh" interactive={false} onAnswer={onAnswer} />);

    expect(screen.queryByRole("button", { name: /发送选择/ })).not.toBeInTheDocument();
    expect(screen.getByText("这轮提问已结束")).toBeInTheDocument();

    fireEvent.click(screen.getByText("小红书"));
    expect(onAnswer).not.toHaveBeenCalled();
  });
});

describe("platform option ordering", () => {
  const mixed = [
    { label: "小红书 (RedNote)" },
    { label: "X (Twitter)" },
    { label: "Instagram" },
    { label: "LinkedIn" }
  ];

  it("classifies platform labels in both languages", () => {
    expect(platformRegionOfLabel("小红书 (RedNote)")).toBe("China");
    expect(platformRegionOfLabel("微信公众号")).toBe("China");
    expect(platformRegionOfLabel("X (Twitter)")).toBe("Global");
    expect(platformRegionOfLabel("TikTok")).toBe("Global");
    expect(platformRegionOfLabel("降价促销")).toBeNull();
  });

  it("lists Global platforms first in English and China platforms first in Chinese", () => {
    const en = orderAskUserOptionsForLocale(mixed, "en", "platform");
    expect(en.map((option) => option.label)).toEqual([
      "X (Twitter)",
      "Instagram",
      "LinkedIn",
      "小红书 (RedNote)"
    ]);

    const zh = orderAskUserOptionsForLocale(mixed, "zh", "platform");
    expect(zh.map((option) => option.label)).toEqual([
      "小红书 (RedNote)",
      "X (Twitter)",
      "Instagram",
      "LinkedIn"
    ]);
  });

  it("keeps stable order inside each region", () => {
    const options = [
      { label: "LinkedIn" },
      { label: "小红书" },
      { label: "Instagram" },
      { label: "公众号" }
    ];
    const zh = orderAskUserOptionsForLocale(options, "zh", "platforms");
    expect(zh.map((option) => option.label)).toEqual(["小红书", "公众号", "LinkedIn", "Instagram"]);
  });

  it("leaves non-platform option lists untouched", () => {
    const options = [
      { label: "写长文" },
      { label: "拍短视频" },
      { label: "做直播" }
    ];
    expect(orderAskUserOptionsForLocale(options, "en", "format")).toEqual(options);
  });

  it("renders the platform question with locale-aware order in the card", () => {
    render(
      <AgentQuestionCard
        locale="en"
        interactive={false}
        questions={[
          {
            id: "platform",
            question: "Which platforms?",
            multiple: true,
            options: [
              { label: "小红书 (RedNote)" },
              { label: "X (Twitter)" },
              { label: "Instagram" },
              { label: "LinkedIn" }
            ]
          }
        ]}
      />
    );

    const labels = screen
      .getAllByRole("button")
      .map((button) => button.textContent?.trim())
      .filter((text): text is string => Boolean(text));
    const order = ["X (Twitter)", "Instagram", "LinkedIn", "小红书 (RedNote)"].map(
      (label) => labels.findIndex((text) => text.includes(label))
    );
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});
