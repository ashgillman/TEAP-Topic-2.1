;;; export-summaries.el --- Build HTML copies of the document summaries -*- lexical-binding: t; -*-

(require 'org)
(require 'ox-html)

(let* ((project-root (expand-file-name default-directory))
       (summary-directory (expand-file-name "summaries" project-root))
       (org-html-head-include-default-style nil)
       (org-html-head-include-scripts nil)
       (org-html-validation-link nil)
       (org-export-with-author nil)
       (org-html-postamble nil)
       (org-export-with-tags nil)
       (org-html-head "<link rel=\"stylesheet\" href=\"../interactive-network/summary.css\" />")
       (files (directory-files summary-directory t "\\.org\\'")))
  (unless (file-directory-p summary-directory)
    (error "Summary directory not found: %s" summary-directory))
  (dolist (file files)
    (unless (string= (file-name-nondirectory file) "README.org")
      (with-current-buffer (find-file-noselect file)
        (let ((output (concat (file-name-sans-extension file) ".html")))
          (org-export-to-file 'html output nil nil nil nil nil)
          (message "Exported %s" output))))))

;;; export-summaries.el ends here
