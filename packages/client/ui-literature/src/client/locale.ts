/** Literature UI copy namespace: paper cards, fulltext view, favorites panel. */
export const NS = 'literature'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    literature: LiteratureKey
  }
}

export const zh = {
  searchTitle: '文献检索',
  searchSummary: '{n} 篇文献 · “{query}”',
  searchEmpty: '没有找到文献',
  searchFailed: '所有来源均检索失败，请稍后重试',
  running: '检索中…',
  viewCards: '查看卡片',
  panelTitle: '本次对话文献',
  panelEmpty: '本次对话还没有搜集到文献。发送检索请求后，卡片会汇总到这里。',
  sourcesTitle: '文献来源',
  sourceCredentials: '已配置凭据：{n} 项',
  sourceOrder: '默认来源顺序',
  fulltextTitle: '全文',
  fulltextSections: '章节',
  fulltextNotFound: '该文献在 Europe PMC 开放获取子集中没有全文（not_found）。',
  abstractLabel: '摘要',
  openAccess: '开放获取',
  sourcesCount: '{n} 个来源',
  paperLink: '原文链接',
  pdfLink: 'PDF',
  parseFailed: '文献结果解析失败',
  rawOutput: '原始输出',
  favoritesTitle: '文献收藏',
  favoritesEmpty: '还没有收藏的文献。检索后点击卡片上的星标即可收藏。',
  favoritesLoading: '加载中…',
  favoritesFailed: '收藏加载失败',
  addFavorite: '收藏',
  removeFavorite: '取消收藏',
  saved: '已收藏',
}

export const en = {
  searchTitle: 'Literature search',
  searchSummary: '{n} papers · “{query}”',
  searchEmpty: 'No papers found',
  searchFailed: 'All sources failed — retry later',
  running: 'Searching…',
  viewCards: 'View cards',
  panelTitle: 'Papers this conversation',
  panelEmpty: 'No papers collected yet. Send a search request and the cards will gather here.',
  sourcesTitle: 'Literature sources',
  sourceCredentials: 'credentials configured: {n}',
  sourceOrder: 'Default source order',
  fulltextTitle: 'Full text',
  fulltextSections: 'Sections',
  fulltextNotFound: 'No open-access full text in the Europe PMC subset (not_found).',
  abstractLabel: 'Abstract',
  openAccess: 'Open access',
  sourcesCount: '{n} sources',
  paperLink: 'Link',
  pdfLink: 'PDF',
  parseFailed: 'Could not parse the literature result',
  rawOutput: 'Raw output',
  favoritesTitle: 'Favorites',
  favoritesEmpty: 'No saved papers yet. Tap the star on a paper card to bookmark it.',
  favoritesLoading: 'Loading…',
  favoritesFailed: 'Failed to load favorites',
  addFavorite: 'Bookmark',
  removeFavorite: 'Remove bookmark',
  saved: 'Saved',
}

/** Dictionary key union owned by this plugin (locale map values are unions). */
export type LiteratureKey = keyof typeof zh
