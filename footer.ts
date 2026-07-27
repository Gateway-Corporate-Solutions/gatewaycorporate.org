interface FooterLink {
  label: string;
  href: string;
}

interface FooterColumn {
  heading: string;
  links: FooterLink[];
}

export type FooterVariant = "default" | "nashtwin" | "devicer" | "hyperlocal";

const brandCopy = "Premiere technology services for the St. Louis area and beyond. Guiding you towards unprecedented success.";

const serviceColumn: FooterColumn = {
  heading: "Services",
  links: [
    { label: "Signals Intelligence", href: "/services#signals-intelligence" },
    { label: "AI Operations", href: "/services#ai-operations" },
    { label: "Digital Twins", href: "/services#simulated-governance" },
    { label: "Strategic Advisory", href: "/services#strategic-advisory" },
    { label: "Custom AI Platforms", href: "/services#custom-platforms" },
    { label: "AI Governance", href: "/services#ai-governance" },
  ],
};

const companyColumn: FooterColumn = {
  heading: "Company",
  links: [
    { label: "About", href: "/#about" },
    { label: "Products", href: "/products" },
    { label: "Demos", href: "/demos" },
    { label: "Team", href: "/#team" },
    { label: "Careers", href: "/careers" },
    { label: "FAQ", href: "/faq" },
    { label: "Forum", href: "/forum" },
    { label: "Journal", href: "/blog" },
    { label: "Contact", href: "/contact" },
  ],
};

const variantColumns: Record<FooterVariant, FooterColumn> = {
  default: {
    heading: "Journal",
    links: [
      { label: "All articles", href: "/blog" },
      { label: "Project work", href: "/#projects" },
    ],
  },
  nashtwin: {
    heading: "NashTwin",
    links: [
      { label: "Problem", href: "/products/nashtwin#problem" },
      { label: "How It Works", href: "/products/nashtwin#twin" },
      { label: "Features", href: "/products/nashtwin#features" },
      { label: "Pricing", href: "/products/nashtwin#pricing" },
    ],
  },
  devicer: {
    heading: "Devicer",
    links: [
      { label: "Problem", href: "/products/devicer#problem" },
      { label: "Suite", href: "/products/devicer#suite" },
      { label: "Features", href: "/products/devicer#features" },
      { label: "Pricing", href: "/products/devicer#pricing" },
    ],
  },
  hyperlocal: {
    heading: "HyperLocal",
    links: [
      { label: "Problem", href: "/products/hyperlocal#problem" },
      { label: "Solution", href: "/products/hyperlocal#solution" },
      { label: "Features", href: "/products/hyperlocal#features" },
      { label: "Pricing", href: "/products/hyperlocal#pricing" },
    ],
  },
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderLinkList(column: FooterColumn): string {
  return `
          <div>
            <h3 class="heading-4 mb-md">${escapeHtml(column.heading)}</h3>
            <ul style="list-style: none; padding: 0">
              ${column.links.map((link) => `<li class="mb-xs"><a href="${escapeHtml(link.href)}" class="text-small footer-link">${escapeHtml(link.label)}</a></li>`).join("\n              ")}
            </ul>
          </div>`;
}

export function resolveFooterVariant(view?: string): FooterVariant {
  switch (view) {
    case "nashtwin":
    case "devicer":
    case "hyperlocal":
      return view;
    default:
      return "default";
  }
}

export function renderSiteFooter(variant: FooterVariant = "default"): string {
  const pageColumn = variantColumns[variant] ?? variantColumns.default;

  return `
    <footer class="footer">
      <div class="container">
        <div class="grid grid-4 gap-lg mb-xl" style="text-align: left; padding-bottom: var(--spacing-md);">
          <div>
            <h3 class="heading-4 mb-md">Gateway Corporate</h3>
            <p class="text-small">${escapeHtml(brandCopy)}</p>
          </div>
          ${renderLinkList(serviceColumn)}
          ${renderLinkList(pageColumn)}
          ${renderLinkList(companyColumn)}
        </div>
        <div style="border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: var(--spacing-md); text-align: center">
          <p class="text-base">&copy; ${new Date().getFullYear()} Gateway Corporate. All rights reserved.</p>
        </div>
      </div>
    </footer>`;
}

export function injectFooterIntoHtml(html: string, variant: FooterVariant = "default"): string {
  const footer = renderSiteFooter(variant);

  if (html.includes("{{SITE_FOOTER}}")) {
    return html.replace("{{SITE_FOOTER}}", footer);
  }

  if (/<footer class="footer">[\s\S]*?<\/footer>/i.test(html)) {
    return html.replace(/<footer class="footer">[\s\S]*?<\/footer>/i, footer);
  }

  if (html.includes("</body>")) {
    return html.replace("</body>", `${footer}\n  </body>`);
  }

  return `${html}\n${footer}`;
}