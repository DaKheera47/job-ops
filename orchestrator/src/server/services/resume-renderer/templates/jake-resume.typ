#set page(paper: "a4", margin: __PAGE_MARGIN__)
#set text(font: "Libertinus Serif", size: __BODY_SIZE__, lang: "en")
#set par(leading: __PAR_LEADING__)

#show link: set text(fill: rgb("#0645ad"))
#show heading.where(level: 1): it => [
  #v(__SECTION_TOP__)
  #text(size: __SECTION_SIZE__, weight: "bold", fill: rgb("__ACCENT__"))[#it.body]
  #v(-2pt)
  #line(length: 100%, stroke: __LINE_WIDTH__)
  #v(__SECTION_BOTTOM__)
]

#align(center)[
  #text(size: __NAME_SIZE__, weight: "bold")[__NAME__] \
__HEADLINE_BLOCK____CONTACT_BLOCK__
]

__BODY__
