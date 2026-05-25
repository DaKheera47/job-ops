#set page(paper: "a4", margin: __PAGE_MARGIN__, fill: __BACKGROUND_COLOR__)
#set text(font: __BODY_FONT__, size: __BODY_SIZE__, lang: "en", fill: __TEXT_COLOR__)
#set par(leading: __PAR_LEADING__)

#show link: set text(fill: __PRIMARY_COLOR__)
#show heading.where(level: 1): it => [
  #v(__SECTION_TOP__)
  #text(font: __HEADING_FONT__, size: __SECTION_SIZE__, weight: "bold", fill: __PRIMARY_COLOR__)[#it.body]
  #v(-2pt)
  #line(length: 100%, stroke: __LINE_WIDTH__ + __PRIMARY_COLOR__)
  #v(__SECTION_BOTTOM__)
]

#align(center)[
__PICTURE_BLOCK__  #text(font: __HEADING_FONT__, size: __NAME_SIZE__, weight: "bold", fill: __PRIMARY_COLOR__)[__NAME__] \
__HEADLINE_BLOCK____LOCATION_BLOCK____CONTACT_BLOCK__
]

__BODY__
