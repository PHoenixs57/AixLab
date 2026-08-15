/** Durable settings namespace for product-wide GUI onboarding facts. */
export const WELCOME_NOTICE_SETTINGS_NAMESPACE = 'ui-onboarding'

/** Field storing the last welcome notice version the user acknowledged. */
export const WELCOME_NOTICE_ACK_FIELD = 'welcomeNoticeVersion'

/**
 * Bump only when the notice changes materially and every user should see it
 * again. The acknowledgement is compared for exact equality.
 */
export const WELCOME_NOTICE_VERSION = '2026-08-14.1'

/** The complete editable internal-testing notice in both supported GUI locales. */
export const WELCOME_NOTICE_COPY = {
  zh: {
    title: '欢迎使用 deepseek-aix',
    body: 'deepseek-aix 是一个面向科学研究的 AI 助手：你可以用对话的方式描述研究主题，deepseek-aix 会通过内置的文献检索服务（PubMed、arXiv、Semantic Scholar、Crossref 等多个来源）帮你搜集相关文献，并把结果整理成可折叠、可收藏的文献卡片。\n\n当前版本仍处于内测阶段，界面与能力还会持续迭代，欢迎提出反馈建议。',
    continueLabel: '继续',
  },
  en: {
    title: 'Welcome to deepseek-aix',
    body: 'deepseek-aix is an AI assistant for scientific research: describe a research topic in conversation and deepseek-aix collects relevant literature through its built-in multi-source search service (PubMed, arXiv, Semantic Scholar, Crossref and more), presenting the results as collapsible, bookmarkable paper cards.\n\nThe current release is still in internal testing; the interface and capabilities will keep evolving. Feedback is welcome.',
    continueLabel: 'Continue',
  },
} as const
