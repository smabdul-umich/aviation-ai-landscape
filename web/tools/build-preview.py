"""Build a self-contained offline snapshot; no credentials or network needed.
Usage: python3 tools/build-preview.py SNAPSHOT_JSON OUTPUT_HTML
"""
import sys,json,pathlib
root=pathlib.Path(__file__).resolve().parents[1]
data=json.loads(pathlib.Path(sys.argv[1]).read_text())
h=(root/'public/index.html').read_text()
h=h.replace('<link rel="stylesheet" href="styles.css">','<style>'+(root/'public/styles.css').read_text()+'</style>')
h=h.replace('<script defer src="app.js"></script>','')
s=json.dumps(data,ensure_ascii=False).replace('<','\\u003c').replace('\u2028','\\u2028').replace('\u2029','\\u2029')
h=h.replace('</body>','<script>window.__AVIATION_SNAPSHOT__='+s+';</script><script>'+(root/'public/app.js').read_text().replace('</script','<\\/script')+'</script></body>')
pathlib.Path(sys.argv[2]).write_text(h)
print('Preview bytes:',len(h.encode()))
