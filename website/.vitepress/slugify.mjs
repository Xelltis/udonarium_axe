/**
 * A copy of VitePress's own slugify with the result put back into NFC.
 * Its NFKD pass strips only the combining marks in U+0300..U+036F, which
 * leaves a Japanese dakuten decomposed: the id holds ハ + U+3099 where a
 * hand-written link holds バ. The two are indistinguishable on screen and
 * never match, and neither the build nor a reviewer can see the difference.
 *
 * The site's config and scripts/check-doc-anchors.mjs both use this, so a
 * link is checked against the same id the site gives the heading.
 */
export const slugify = (str) =>
  str
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/[\s~`!@#$%^&*()\-_+=[\]{}|\;:"'“”‘’<>,.?/]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^(\d)/, '_$1')
    .toLowerCase()
    .normalize('NFC');
