# Unsafe

Before the payload.

<script>window.__pwned = 'script'</script>
<img src="x" onerror="window.__pwned = 'onerror'">
<a href="javascript:window.__pwned = 'href'">click me</a>
<iframe src="https://example.com/frame"></iframe>
<div style="position:fixed;inset:0" onclick="window.__pwned = 'onclick'">overlay</div>

After the payload.
