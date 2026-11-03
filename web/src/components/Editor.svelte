<script lang="ts">
  import { onMount } from "svelte";
  import { EditorState, Compartment } from "@codemirror/state";
  import { EditorView, keymap, placeholder as cmPlaceholder, drawSelection, highlightActiveLine } from "@codemirror/view";
  import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
  import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
  import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
  import { tags } from "@lezer/highlight";

  let {
    value,
    onchange,
    placeholder = "",
    monospace = false,
    autofocus = false,
  }: { value: string; onchange: (v: string) => void; placeholder?: string; monospace?: boolean; autofocus?: boolean } = $props();

  let host: HTMLDivElement;
  let view: EditorView;
  // svelte-ignore state_referenced_locally
  let lastEmitted = value;

  const highlight = HighlightStyle.define([
    { tag: tags.heading1, color: "var(--mark-heading)", fontWeight: "700", fontSize: "1.3em" },
    { tag: tags.heading2, color: "var(--mark-heading)", fontWeight: "700", fontSize: "1.15em" },
    { tag: [tags.heading3, tags.heading4, tags.heading5, tags.heading6], color: "var(--mark-heading)", fontWeight: "600" },
    { tag: tags.strong, color: "var(--mark-strong)", fontWeight: "700" },
    { tag: tags.emphasis, color: "var(--mark-emph)", fontStyle: "italic" },
    { tag: tags.quote, color: "var(--mark-quote)", fontStyle: "italic" },
    { tag: tags.link, color: "var(--mark-link)" },
    { tag: tags.url, color: "var(--mark-link)", textDecoration: "underline" },
    { tag: tags.monospace, color: "var(--mark-code)", fontFamily: "var(--font-mono)", fontSize: "0.9em" },
    { tag: tags.processingInstruction, color: "var(--fg-3)" },
    { tag: tags.list, color: "var(--mark-heading)" },
    { tag: tags.meta, color: "var(--fg-3)" },
  ]);

  const fontCompartment = new Compartment();

  onMount(() => {
    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          drawSelection(),
          highlightActiveLine(),
          EditorView.lineWrapping,
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          markdown({ base: markdownLanguage }),
          syntaxHighlighting(highlight),
          cmPlaceholder(placeholder),
          fontCompartment.of(
            EditorView.theme({
              "&": { fontSize: monospace ? "13px" : "17px" },
              ".cm-content, .cm-placeholder": { fontFamily: monospace ? "var(--font-mono)" : "var(--font-write)" },
            }),
          ),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) {
              lastEmitted = u.state.doc.toString();
              onchange(lastEmitted);
            }
          }),
        ],
      }),
    });
    if (autofocus) view.focus();
    return () => view.destroy();
  });

  // External value changes (navigation to another day) replace the document.
  $effect(() => {
    const v = value;
    if (view && v !== lastEmitted) {
      lastEmitted = v;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: v } });
    }
  });

  export function focus() {
    view?.focus();
  }
</script>

<div class="editor" bind:this={host}></div>

<style>
  .editor {
    min-height: 200px;
  }
</style>
