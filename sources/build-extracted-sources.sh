#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
register="$script_dir/source-register.tsv"
output_root="$script_dir/extracted"

for command_name in pdftotext pdfinfo pandoc file shasum; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
        echo "Required command not found: $command_name" >&2
        exit 1
    fi
done

mkdir -p "$output_root"

tail -n +2 "$register" | while IFS="	" read -r region relative_file title issuing_body publication_date retrieval_date source_url landing_page authority_class status; do
    if [ "$status" != "downloaded" ] && [ "$status" != "retained_local" ]; then
        continue
    fi

    source_file="$script_dir/$relative_file"
    if [ ! -s "$source_file" ]; then
        echo "Missing or empty source: $source_file" >&2
        exit 1
    fi

    source_filename=$(basename "$source_file")
    package_name=${source_filename%.*}
    package_dir="$output_root/$package_name"
    document_file="$package_dir/document.txt"
    metadata_file="$package_dir/metadata.txt"
    mkdir -p "$package_dir"

    case "$source_file" in
        *.pdf)
            pdftotext -layout "$source_file" "$document_file"
            ;;
        *.docx)
            pandoc --from docx --to plain --wrap=none "$source_file" -o "$document_file"
            ;;
        *)
            echo "Unsupported source format: $source_file" >&2
            exit 1
            ;;
    esac
    if [ ! -s "$document_file" ]; then
        echo "Empty text extraction: $source_file" >&2
        exit 1
    fi

    {
        echo "Title: $title"
        echo "Issuing body: $issuing_body"
        echo "Region: $region"
        echo "Publication/current date: $publication_date"
        echo "Retrieval date: $retrieval_date"
        echo "Authority class: $authority_class"
        echo "Acquisition status: $status"
        echo "Source URL: $source_url"
        echo "Landing page: $landing_page"
        echo "Source file: $relative_file"
        echo "SHA-256: $(shasum -a 256 "$source_file" | awk '{print $1}')"
        echo
        case "$source_file" in
            *.pdf)
                pdfinfo "$source_file"
                ;;
            *.docx)
                echo "File format: $(file -b "$source_file")"
                ;;
        esac
    } > "$metadata_file"
    sed -E 's/[[:blank:]]+$//' "$metadata_file" > "$metadata_file.tmp"
    mv "$metadata_file.tmp" "$metadata_file"
done

echo "Extracted source packages rebuilt under $output_root"
