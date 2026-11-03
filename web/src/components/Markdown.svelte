<script lang="ts">
  import { marked } from "marked";
  import DOMPurify from "dompurify";

  let { source }: { source: string } = $props();

  const html = $derived(DOMPurify.sanitize(marked.parse(source, { async: false, gfm: true, breaks: false }) as string));
</script>

<div class="md">{@html html}</div>
