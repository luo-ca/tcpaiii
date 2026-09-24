/**
 * 剔除 C0/C1 控制字符与 DEL。
 *
 * 用户输入（地址栏参数、粘贴的标签/URL）可能夹带控制字符。它们有几个共同的坑：
 *   · trim() 只去空白，不去 NUL(\u0000) 这类控制符；
 *   · 单个控制字符是非空字符串，filter(Boolean) 判定为真，会被当成合法值；
 *   · 渲染出来是零宽的 —— 界面出现「看不见却真实生效」的值
 *     （空胶囊标签、看着为空却在筛选的搜索框）。
 *
 * 只剔控制字符，不做「只留字母数字」那种激进过滤：
 * 本站的标签合法地包含中文、emoji、空格。
 */
export function stripControlChars(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '');
}
