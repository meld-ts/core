/**
 * ARIA 基础数据。
 *
 * 生成文件，勿手改。由 scripts/a11y-sync.ts 从 aria-query 生成。
 */

/** ARIA 属性名（输出形态去掉 aria- 前缀）。 */
export type AriaKey =
  | 'activedescendant'
  | 'atomic'
  | 'autocomplete'
  | 'braillelabel'
  | 'brailleroledescription'
  | 'busy'
  | 'checked'
  | 'colcount'
  | 'colindex'
  | 'colspan'
  | 'controls'
  | 'current'
  | 'describedby'
  | 'description'
  | 'details'
  | 'disabled'
  | 'dropeffect'
  | 'errormessage'
  | 'expanded'
  | 'flowto'
  | 'grabbed'
  | 'haspopup'
  | 'hidden'
  | 'invalid'
  | 'keyshortcuts'
  | 'label'
  | 'labelledby'
  | 'level'
  | 'live'
  | 'modal'
  | 'multiline'
  | 'multiselectable'
  | 'orientation'
  | 'owns'
  | 'placeholder'
  | 'posinset'
  | 'pressed'
  | 'readonly'
  | 'relevant'
  | 'required'
  | 'roledescription'
  | 'rowcount'
  | 'rowindex'
  | 'rowspan'
  | 'selected'
  | 'setsize'
  | 'sort'
  | 'valuemax'
  | 'valuemin'
  | 'valuenow'
  | 'valuetext';

/** 引用多个 id 的属性（aria-query 类型 idlist）。 */
export type AriaIdListKey =
  | 'controls'
  | 'describedby'
  | 'flowto'
  | 'labelledby'
  | 'owns';

/** 引用单个 id 的属性（aria-query 类型 id）。 */
export type AriaIdKey = 'activedescendant' | 'details' | 'errormessage';

/** 每个属性的合法取值（aria-query 生成）。 */
export type AriaValue<K extends AriaKey> = K extends 'activedescendant'
  ? string
  : K extends 'atomic'
    ? boolean
    : K extends 'autocomplete'
      ? 'both' | 'inline' | 'list' | 'none'
      : K extends 'braillelabel'
        ? string
        : K extends 'brailleroledescription'
          ? string
          : K extends 'busy'
            ? boolean
            : K extends 'checked'
              ? boolean | 'mixed'
              : K extends 'colcount'
                ? number
                : K extends 'colindex'
                  ? number
                  : K extends 'colspan'
                    ? number
                    : K extends 'controls'
                      ? string | readonly string[]
                      : K extends 'current'
                        ?
                            | boolean
                            | 'date'
                            | 'location'
                            | 'page'
                            | 'step'
                            | 'time'
                        : K extends 'describedby'
                          ? string | readonly string[]
                          : K extends 'description'
                            ? string
                            : K extends 'details'
                              ? string
                              : K extends 'disabled'
                                ? boolean
                                : K extends 'dropeffect'
                                  ?
                                      | 'copy'
                                      | 'execute'
                                      | 'link'
                                      | 'move'
                                      | 'none'
                                      | 'popup'
                                  : K extends 'errormessage'
                                    ? string
                                    : K extends 'expanded'
                                      ? boolean
                                      : K extends 'flowto'
                                        ? string | readonly string[]
                                        : K extends 'grabbed'
                                          ? boolean
                                          : K extends 'haspopup'
                                            ?
                                                | boolean
                                                | 'dialog'
                                                | 'grid'
                                                | 'listbox'
                                                | 'menu'
                                                | 'tree'
                                            : K extends 'hidden'
                                              ? boolean
                                              : K extends 'invalid'
                                                ?
                                                    | boolean
                                                    | 'grammar'
                                                    | 'spelling'
                                                : K extends 'keyshortcuts'
                                                  ? string
                                                  : K extends 'label'
                                                    ? string
                                                    : K extends 'labelledby'
                                                      ?
                                                          | string
                                                          | readonly string[]
                                                      : K extends 'level'
                                                        ? number
                                                        : K extends 'live'
                                                          ?
                                                              | 'assertive'
                                                              | 'off'
                                                              | 'polite'
                                                          : K extends 'modal'
                                                            ? boolean
                                                            : K extends 'multiline'
                                                              ? boolean
                                                              : K extends 'multiselectable'
                                                                ? boolean
                                                                : K extends 'orientation'
                                                                  ?
                                                                      | 'horizontal'
                                                                      | 'vertical'
                                                                  : K extends 'owns'
                                                                    ?
                                                                        | string
                                                                        | readonly string[]
                                                                    : K extends 'placeholder'
                                                                      ? string
                                                                      : K extends 'posinset'
                                                                        ? number
                                                                        : K extends 'pressed'
                                                                          ?
                                                                              | boolean
                                                                              | 'mixed'
                                                                          : K extends 'readonly'
                                                                            ? boolean
                                                                            : K extends 'relevant'
                                                                              ?
                                                                                  | 'additions'
                                                                                  | 'all'
                                                                                  | 'removals'
                                                                                  | 'text'
                                                                              : K extends 'required'
                                                                                ? boolean
                                                                                : K extends 'roledescription'
                                                                                  ? string
                                                                                  : K extends 'rowcount'
                                                                                    ? number
                                                                                    : K extends 'rowindex'
                                                                                      ? number
                                                                                      : K extends 'rowspan'
                                                                                        ? number
                                                                                        : K extends 'selected'
                                                                                          ? boolean
                                                                                          : K extends 'setsize'
                                                                                            ? number
                                                                                            : K extends 'sort'
                                                                                              ?
                                                                                                  | 'ascending'
                                                                                                  | 'descending'
                                                                                                  | 'none'
                                                                                                  | 'other'
                                                                                              : K extends 'valuemax'
                                                                                                ? number
                                                                                                : K extends 'valuemin'
                                                                                                  ? number
                                                                                                  : K extends 'valuenow'
                                                                                                    ? number
                                                                                                    : K extends 'valuetext'
                                                                                                      ? string
                                                                                                      : string;

/** 可用的 role（aria-query 非抽象 role）。 */
export type A11yRole =
  | 'alert'
  | 'alertdialog'
  | 'application'
  | 'article'
  | 'banner'
  | 'blockquote'
  | 'button'
  | 'caption'
  | 'cell'
  | 'checkbox'
  | 'code'
  | 'columnheader'
  | 'combobox'
  | 'complementary'
  | 'contentinfo'
  | 'definition'
  | 'deletion'
  | 'dialog'
  | 'directory'
  | 'doc-abstract'
  | 'doc-acknowledgments'
  | 'doc-afterword'
  | 'doc-appendix'
  | 'doc-backlink'
  | 'doc-biblioentry'
  | 'doc-bibliography'
  | 'doc-biblioref'
  | 'doc-chapter'
  | 'doc-colophon'
  | 'doc-conclusion'
  | 'doc-cover'
  | 'doc-credit'
  | 'doc-credits'
  | 'doc-dedication'
  | 'doc-endnote'
  | 'doc-endnotes'
  | 'doc-epigraph'
  | 'doc-epilogue'
  | 'doc-errata'
  | 'doc-example'
  | 'doc-footnote'
  | 'doc-foreword'
  | 'doc-glossary'
  | 'doc-glossref'
  | 'doc-index'
  | 'doc-introduction'
  | 'doc-noteref'
  | 'doc-notice'
  | 'doc-pagebreak'
  | 'doc-pagefooter'
  | 'doc-pageheader'
  | 'doc-pagelist'
  | 'doc-part'
  | 'doc-preface'
  | 'doc-prologue'
  | 'doc-pullquote'
  | 'doc-qna'
  | 'doc-subtitle'
  | 'doc-tip'
  | 'doc-toc'
  | 'document'
  | 'emphasis'
  | 'feed'
  | 'figure'
  | 'form'
  | 'generic'
  | 'graphics-document'
  | 'graphics-object'
  | 'graphics-symbol'
  | 'grid'
  | 'gridcell'
  | 'group'
  | 'heading'
  | 'img'
  | 'insertion'
  | 'link'
  | 'list'
  | 'listbox'
  | 'listitem'
  | 'log'
  | 'main'
  | 'mark'
  | 'marquee'
  | 'math'
  | 'menu'
  | 'menubar'
  | 'menuitem'
  | 'menuitemcheckbox'
  | 'menuitemradio'
  | 'meter'
  | 'navigation'
  | 'none'
  | 'note'
  | 'option'
  | 'paragraph'
  | 'presentation'
  | 'progressbar'
  | 'radio'
  | 'radiogroup'
  | 'region'
  | 'row'
  | 'rowgroup'
  | 'rowheader'
  | 'scrollbar'
  | 'search'
  | 'searchbox'
  | 'separator'
  | 'slider'
  | 'spinbutton'
  | 'status'
  | 'strong'
  | 'subscript'
  | 'superscript'
  | 'switch'
  | 'tab'
  | 'table'
  | 'tablist'
  | 'tabpanel'
  | 'term'
  | 'textbox'
  | 'time'
  | 'timer'
  | 'toolbar'
  | 'tooltip'
  | 'tree'
  | 'treegrid'
  | 'treeitem';

/** 每个 role 的名字规则。 */
export type A11yNameRule = {
  readonly alert: 'optional';
  readonly alertdialog: 'required';
  readonly application: 'required';
  readonly article: 'optional';
  readonly banner: 'optional';
  readonly blockquote: 'optional';
  readonly button: 'optional';
  readonly caption: 'prohibited';
  readonly cell: 'optional';
  readonly checkbox: 'optional';
  readonly code: 'prohibited';
  readonly columnheader: 'optional';
  readonly combobox: 'required';
  readonly complementary: 'optional';
  readonly contentinfo: 'optional';
  readonly definition: 'optional';
  readonly deletion: 'prohibited';
  readonly dialog: 'required';
  readonly directory: 'optional';
  readonly 'doc-abstract': 'optional';
  readonly 'doc-acknowledgments': 'optional';
  readonly 'doc-afterword': 'optional';
  readonly 'doc-appendix': 'optional';
  readonly 'doc-backlink': 'optional';
  readonly 'doc-biblioentry': 'required';
  readonly 'doc-bibliography': 'optional';
  readonly 'doc-biblioref': 'optional';
  readonly 'doc-chapter': 'optional';
  readonly 'doc-colophon': 'optional';
  readonly 'doc-conclusion': 'optional';
  readonly 'doc-cover': 'optional';
  readonly 'doc-credit': 'optional';
  readonly 'doc-credits': 'optional';
  readonly 'doc-dedication': 'optional';
  readonly 'doc-endnote': 'optional';
  readonly 'doc-endnotes': 'optional';
  readonly 'doc-epigraph': 'optional';
  readonly 'doc-epilogue': 'optional';
  readonly 'doc-errata': 'optional';
  readonly 'doc-example': 'optional';
  readonly 'doc-footnote': 'optional';
  readonly 'doc-foreword': 'optional';
  readonly 'doc-glossary': 'optional';
  readonly 'doc-glossref': 'optional';
  readonly 'doc-index': 'optional';
  readonly 'doc-introduction': 'optional';
  readonly 'doc-noteref': 'optional';
  readonly 'doc-notice': 'optional';
  readonly 'doc-pagebreak': 'required';
  readonly 'doc-pagefooter': 'prohibited';
  readonly 'doc-pageheader': 'prohibited';
  readonly 'doc-pagelist': 'optional';
  readonly 'doc-part': 'required';
  readonly 'doc-preface': 'optional';
  readonly 'doc-prologue': 'optional';
  readonly 'doc-pullquote': 'optional';
  readonly 'doc-qna': 'optional';
  readonly 'doc-subtitle': 'optional';
  readonly 'doc-tip': 'optional';
  readonly 'doc-toc': 'optional';
  readonly document: 'optional';
  readonly emphasis: 'prohibited';
  readonly feed: 'optional';
  readonly figure: 'optional';
  readonly form: 'optional';
  readonly generic: 'prohibited';
  readonly 'graphics-document': 'required';
  readonly 'graphics-object': 'optional';
  readonly 'graphics-symbol': 'required';
  readonly grid: 'required';
  readonly gridcell: 'optional';
  readonly group: 'optional';
  readonly heading: 'optional';
  readonly img: 'required';
  readonly insertion: 'prohibited';
  readonly link: 'optional';
  readonly list: 'optional';
  readonly listbox: 'required';
  readonly listitem: 'optional';
  readonly log: 'optional';
  readonly main: 'optional';
  readonly mark: 'prohibited';
  readonly marquee: 'required';
  readonly math: 'optional';
  readonly menu: 'optional';
  readonly menubar: 'optional';
  readonly menuitem: 'optional';
  readonly menuitemcheckbox: 'optional';
  readonly menuitemradio: 'optional';
  readonly meter: 'required';
  readonly navigation: 'optional';
  readonly none: 'optional';
  readonly note: 'optional';
  readonly option: 'optional';
  readonly paragraph: 'prohibited';
  readonly presentation: 'prohibited';
  readonly progressbar: 'required';
  readonly radio: 'optional';
  readonly radiogroup: 'required';
  readonly region: 'required';
  readonly row: 'optional';
  readonly rowgroup: 'optional';
  readonly rowheader: 'optional';
  readonly scrollbar: 'optional';
  readonly search: 'optional';
  readonly searchbox: 'required';
  readonly separator: 'optional';
  readonly slider: 'required';
  readonly spinbutton: 'required';
  readonly status: 'optional';
  readonly strong: 'prohibited';
  readonly subscript: 'prohibited';
  readonly superscript: 'prohibited';
  readonly switch: 'optional';
  readonly tab: 'optional';
  readonly table: 'required';
  readonly tablist: 'optional';
  readonly tabpanel: 'required';
  readonly term: 'optional';
  readonly textbox: 'required';
  readonly time: 'optional';
  readonly timer: 'optional';
  readonly toolbar: 'optional';
  readonly tooltip: 'optional';
  readonly tree: 'required';
  readonly treegrid: 'required';
  readonly treeitem: 'optional';
};
