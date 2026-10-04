#set page(
  paper: "us-letter",
  margin: (x: 0.9in, y: 0.8in),
)

#set text(font: "Libertinus Serif", size: 10.2pt, fill: rgb("#0f172a"))
#set par(justify: true, leading: 0.7em)

#let accent = rgb("#0b3aa4")
#let muted = rgb("#475569")
#let divider = rgb("#cbd5e1")

#align(center)[
  #text(8.8pt, fill: muted)[GATEWAY CORPORATE - TECHNICAL BRIEF]
  #v(0.2em)
  #text(18pt, weight: "bold", fill: accent)[Whitepaper Portfolio Brief]
  #v(0.25em)
  #text(9.4pt, fill: muted)[Architecture, deployment, and diligence reference]
]

#v(0.7em)
#line(length: 100%, stroke: 0.8pt + divider)
#v(0.65em)

Gateway Corporate whitepapers are built for technical operators who need deployment
clarity under real constraints. Each paper emphasizes system behavior, risk surfaces,
and implementation implications over abstract positioning.

#v(0.7em)
#text(11.8pt, weight: "bold", fill: accent)[Library Matrix]
#v(0.35em)

#table(
  columns: (2.35fr, 1.55fr, 2.4fr),
  inset: 8pt,
  stroke: (x: 0.55pt + divider, y: 0.55pt + rgb("#e2e8f0")),

  [#text(9.4pt, weight: "bold")[Document]],
  [#text(9.4pt, weight: "bold")[Best Fit]],
  [#text(9.4pt, weight: "bold")[Core Technical Scope]],

  [#link("https://gatewaycorporate.org/papers/Devicer-NEXT.pdf")[#text(weight: "bold", fill: accent)[Devicer NEXT Whitepaper]]],
  [Browser changes and exact document duplicates],
  [Engineering preview: versioned observations, explainable comparisons, calibration, retrieval, and governance],

  [#link("https://gatewaycorporate.org/papers/HyperLocal-2.pdf")[#text(weight: "bold", fill: accent)[HyperLocal 2 Whitepaper]]],
  [Messaging and CRM operators],
  [Routed SMS operations, permissioned automations, and governed conversational workflows],

  [#link("https://gatewaycorporate.org/papers/One-Page-Brief.pdf")[#text(weight: "bold", fill: accent)[Gateway Corporate One-Page Brief]]],
  [Executive and architecture screening],
  [Condensed product/service alignment for rapid technical-commercial review],
)

#v(0.8em)
#text(11.8pt, weight: "bold", fill: accent)[Suggested Review Sequence]
#v(0.35em)

1. #link("https://gatewaycorporate.org/papers/GCS-One-Page-Brief.pdf")[GCS One-Page Brief] for context and stakeholder alignment.
2. #link("https://gatewaycorporate.org/papers/Devicer-NEXT.pdf")[Devicer NEXT] for comparison evidence, explicit uncertainty, and preview release scope.
3. #link("https://gatewaycorporate.org/papers/HyperLocal-2.pdf")[HyperLocal 2] for communication workflow governance.

#v(0.75em)
#text(11.8pt, weight: "bold", fill: accent)[Action Path]
#v(0.3em)

After review, route architecture-fit questions through
#link("https://gatewaycorporate.org/contact")[gatewaycorporate.org/contact]
to map paper findings to your production environment.

One #link("https://gatewaycorporate.org/products/devicer#pricing")[Devicer license]
includes all premium Devicer plugins and features forever, including those not yet
developed, as they are released. The core remains open source. Confirm deployment,
third-party services, and other product licensing separately.

#v(0.7em)
#line(length: 100%, stroke: 0.7pt + divider)
#v(0.3em)
#align(right)[#text(8.8pt, fill: muted)[Updated: 2026-10-04]]
