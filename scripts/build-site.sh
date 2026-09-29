#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
build_root="${1:-}"

if [[ -z "$build_root" ]]; then
  build_root="$(mktemp -d)"
elif [[ -e "$build_root" ]]; then
  if [[ -n "$(find "$build_root" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
    echo "Refusing to reuse non-empty build directory: $build_root" >&2
    exit 1
  fi
else
  mkdir -p "$build_root"
fi

source_root="$build_root/source"
site_root="$build_root/site"
mkdir -p "$source_root" "$site_root"

cp "$project_root/study.org" "$project_root/resources.org" "$source_root/"
cp -R "$project_root/summaries" "$project_root/interactive-network" \
  "$project_root/concept-explorer" "$project_root/concept-graphs" \
  "$project_root/figures" "$source_root/"

(
  cd "$source_root"
  emacs --batch --quick --load interactive-network/export-summaries.el
  emacs --batch --quick study.org \
    --eval '(progn (require '\''org) (require '\''ox-html) (org-html-export-to-html))'
  emacs --batch --quick resources.org \
    --eval '(progn (require '\''org) (require '\''ox-html) (org-html-export-to-html))'
  node interactive-network/build.mjs
)

cp "$source_root/study.html" "$source_root/resources.html" "$site_root/"
cp -R "$source_root/summaries" "$site_root/summaries"
cp -R "$source_root/interactive-network" "$site_root/interactive-network"
cp -R "$source_root/concept-explorer" "$site_root/concept-explorer"
find "$site_root/summaries" "$site_root/interactive-network" \
  "$site_root/concept-explorer" -type f -name '*.org' -delete
find "$site_root/summaries" "$site_root/interactive-network" \
  "$site_root/concept-explorer" -type f -name 'README.org' -delete
mkdir -p "$site_root/concept-graphs" "$site_root/figures"
cp "$source_root/concept-graphs/"*.tsv "$site_root/concept-graphs/"
cp "$source_root/figures/"*.svg "$site_root/figures/"

# Local source files are intentionally not published with the study pages.
# Remove their links from the generated HTML rather than leave broken downloads.
while IFS= read -r -d '' html_file; do
  perl -0pi -e 's{<a\b[^>]*href="(?:\.\./)?sources/[^\"]*"[^>]*>(.*?)</a>}{$1}gs; s{<a\b[^>]*href="file:///Users/[^\"]*"[^>]*>(.*?)</a>}{$1}gs' "$html_file"
done < <(find "$site_root" -type f -name '*.html' -print0)

cat > "$site_root/index.html" <<'EOF'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>TEAP Topic 2.1</title>
  </head>
  <body>
    <main>
      <h1>TEAP Topic 2.1</h1>
      <ul>
        <li><a href="study.html">Study guide</a></li>
        <li><a href="resources.html">RSPP resources</a></li>
        <li><a href="interactive-network/">Interactive document network</a></li>
        <li><a href="concept-explorer/">Concept explorer</a></li>
      </ul>
    </main>
  </body>
</html>
EOF

printf 'Built Pages site: %s\n' "$site_root"
