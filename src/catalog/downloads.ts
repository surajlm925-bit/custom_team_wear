/**
 * Catalog Downloads configuration and links.
 * Google Drive hosted catalogs for Custom Teamwear WhatsApp Bot.
 */

export const CATALOG_DRIVE_FOLDER_URL =
  "https://drive.google.com/drive/folders/1Ljb99FY2hJklBGdAg_tE815Xla6qV1Mk?usp=sharing";

export interface CatalogDownloadItem {
  tier: "Basic" | "Standard" | "Premium";
  name: string;
  fileId: string;
  viewUrl: string;
  downloadUrl: string;
  keywords: string[];
}

export const CATALOG_DOWNLOAD_ITEMS: CatalogDownloadItem[] = [
  // --- 1. Basic Tier ---
  {
    tier: "Basic",
    name: "Cotton Polo",
    fileId: "1Mpj2aisGjqyHEjSiGUDfkMxj6fhn1EdG",
    viewUrl: "https://drive.google.com/file/d/1Mpj2aisGjqyHEjSiGUDfkMxj6fhn1EdG/view?usp=sharing",
    downloadUrl: "https://drive.google.com/uc?export=download&id=1Mpj2aisGjqyHEjSiGUDfkMxj6fhn1EdG",
    keywords: ["cotton polo", "basic cotton polo", "basic polo"],
  },
  {
    tier: "Basic",
    name: "Cotton Round Neck",
    fileId: "1V-le99xxU-R8eEaYSGHSdhVuMiG64uYa",
    viewUrl: "https://drive.google.com/file/d/1V-le99xxU-R8eEaYSGHSdhVuMiG64uYa/view?usp=sharing",
    downloadUrl: "https://drive.google.com/uc?export=download&id=1V-le99xxU-R8eEaYSGHSdhVuMiG64uYa",
    keywords: ["cotton round neck", "cotton round", "basic cotton round neck"],
  },
  {
    tier: "Basic",
    name: "Dry Fit Polo",
    fileId: "1aIjCP_0ma3dPMZqjrBjZIzFJ3QvlFbYj",
    viewUrl: "https://drive.google.com/file/d/1aIjCP_0ma3dPMZqjrBjZIzFJ3QvlFbYj/view?usp=sharing",
    downloadUrl: "https://drive.google.com/uc?export=download&id=1aIjCP_0ma3dPMZqjrBjZIzFJ3QvlFbYj",
    keywords: ["drifit polo", "dry fit polo", "basic dry fit polo", "basic drifit polo"],
  },
  {
    tier: "Basic",
    name: "Dry Fit Round Neck",
    fileId: "1qY9rhvhtOw1t7IxJ2Qt8xfX22lOfLqHh",
    viewUrl: "https://drive.google.com/file/d/1qY9rhvhtOw1t7IxJ2Qt8xfX22lOfLqHh/view?usp=sharing",
    downloadUrl: "https://drive.google.com/uc?export=download&id=1qY9rhvhtOw1t7IxJ2Qt8xfX22lOfLqHh",
    keywords: ["drifit round neck", "dry fit round neck", "basic dry fit round neck", "basic drifit round neck"],
  },

  // --- 2. Standard Tier ---
  {
    tier: "Standard",
    name: "Standard Polo Cotton",
    fileId: "1v4Jl_QkNF2tGGWC0J9y_EqAGK8DGjxvA",
    viewUrl: "https://drive.google.com/file/d/1v4Jl_QkNF2tGGWC0J9y_EqAGK8DGjxvA/view?usp=sharing",
    downloadUrl: "https://drive.google.com/uc?export=download&id=1v4Jl_QkNF2tGGWC0J9y_EqAGK8DGjxvA",
    keywords: ["standard polo cotton", "standard cotton polo"],
  },
  {
    tier: "Standard",
    name: "Standard Polo Dry Fit",
    fileId: "1kwNGEsUM1driO4680jIRTb2xefxiYFk9",
    viewUrl: "https://drive.google.com/file/d/1kwNGEsUM1driO4680jIRTb2xefxiYFk9/view?usp=sharing",
    downloadUrl: "https://drive.google.com/uc?export=download&id=1kwNGEsUM1driO4680jIRTb2xefxiYFk9",
    keywords: ["standard polo drifit", "standard polo dry fit", "standard drifit polo"],
  },

  // --- 3. Premium Tier ---
  {
    tier: "Premium",
    name: "Adidas Catalogue",
    fileId: "1ycWysBWMVRU4c1-VjulnrOYXxMVoSnzH",
    viewUrl: "https://drive.google.com/file/d/1ycWysBWMVRU4c1-VjulnrOYXxMVoSnzH/view?usp=sharing",
    downloadUrl: "https://drive.google.com/uc?export=download&id=1ycWysBWMVRU4c1-VjulnrOYXxMVoSnzH",
    keywords: ["adidas", "adidas catalogue", "adidas catalog"],
  },
  {
    tier: "Premium",
    name: "Reebok Catalogue",
    fileId: "1ySBJFmP7BISFwS5ckCAz-BwEkgUVe5fx",
    viewUrl: "https://drive.google.com/file/d/1ySBJFmP7BISFwS5ckCAz-BwEkgUVe5fx/view?usp=sharing",
    downloadUrl: "https://drive.google.com/uc?export=download&id=1ySBJFmP7BISFwS5ckCAz-BwEkgUVe5fx",
    keywords: ["reebok", "reebok catalogue", "reebok catalog"],
  },
  {
    tier: "Premium",
    name: "Van Heusen Catalogue",
    fileId: "1nJkDLDQ0XVg0DX9z_wmr4TLieLLn18L7",
    viewUrl: "https://drive.google.com/file/d/1nJkDLDQ0XVg0DX9z_wmr4TLieLLn18L7/view?usp=sharing",
    downloadUrl: "https://drive.google.com/uc?export=download&id=1nJkDLDQ0XVg0DX9z_wmr4TLieLLn18L7",
    keywords: ["van heusen", "vh", "van heusen catalogue", "van heusen catalog"],
  },
  {
    tier: "Premium",
    name: "Stellars Nano-Dry",
    fileId: "10CM_kC163YHohbvxOGvBL5hYEsgBzPBx",
    viewUrl: "https://drive.google.com/file/d/10CM_kC163YHohbvxOGvBL5hYEsgBzPBx/view?usp=sharing",
    downloadUrl: "https://drive.google.com/uc?export=download&id=10CM_kC163YHohbvxOGvBL5hYEsgBzPBx",
    keywords: ["nano dry", "nano-dry", "stellers nano-dry", "stellars nano-dry"],
  },
  {
    tier: "Premium",
    name: "Stellars Softberry Golf Polo (Men)",
    fileId: "1zWlXBSgKrIghGsiEin7Oo8sPadurZMsY",
    viewUrl: "https://drive.google.com/file/d/1zWlXBSgKrIghGsiEin7Oo8sPadurZMsY/view?usp=sharing",
    downloadUrl: "https://drive.google.com/uc?export=download&id=1zWlXBSgKrIghGsiEin7Oo8sPadurZMsY",
    keywords: ["softberry men", "golf polo men", "softberry golf polo men", "stellars softberry men"],
  },
  {
    tier: "Premium",
    name: "Stellars Softberry Golf Polo (Women)",
    fileId: "1KZX31qkxeMDpd_-R_xF84jIg0vWn9K4F",
    viewUrl: "https://drive.google.com/file/d/1KZX31qkxeMDpd_-R_xF84jIg0vWn9K4F/view?usp=sharing",
    downloadUrl: "https://drive.google.com/uc?export=download&id=1KZX31qkxeMDpd_-R_xF84jIg0vWn9K4F",
    keywords: ["softberry women", "golf polo women", "softberry golf polo women", "stellars softberry women"],
  },
];

export function renderCatalogDownloadList(): string {
  const basicItems = CATALOG_DOWNLOAD_ITEMS.filter((i) => i.tier === "Basic");
  const standardItems = CATALOG_DOWNLOAD_ITEMS.filter((i) => i.tier === "Standard");
  const premiumItems = CATALOG_DOWNLOAD_ITEMS.filter((i) => i.tier === "Premium");

  const formatSection = (title: string, emoji: string, items: CatalogDownloadItem[]) => {
    const lines = items.map((item) => `• *${item.name}*:\n  🔗 ${item.viewUrl}`);
    return `${emoji} *${title}*\n${lines.join("\n")}`;
  };

  return (
    `📁 *Custom Teamwear — Product Catalogs*\n\n` +
    `Browse our complete collection of T-Shirt styles and specifications below. Tap any link to open & download the exact catalog PDF:\n\n` +
    formatSection("Basic T-Shirts (Economical & Daily Bulk)", "🔹", basicItems) +
    `\n\n` +
    formatSection("Standard T-Shirts (Combed Cotton & High Performance)", "🔸", standardItems) +
    `\n\n` +
    formatSection("Premium Brand T-Shirts (Corporate & Retail Brands)", "⭐", premiumItems) +
    `\n\n` +
    `📂 *All Catalogs Folder (Google Drive):*\n` +
    `${CATALOG_DRIVE_FOLDER_URL}\n\n` +
    `_Ready to order? Choose an option below:_`
  );
}

export function findCatalogByQuery(query: string): CatalogDownloadItem | undefined {
  const q = query.toLowerCase().trim();
  if (!q || q.length < 3) return undefined;
  if (["catalog", "catalogs", "catalogue", "catalogues", "pdf", "drive", "download", "view"].includes(q)) {
    return undefined;
  }
  for (const item of CATALOG_DOWNLOAD_ITEMS) {
    if (item.name.toLowerCase().includes(q)) return item;
    for (const kw of item.keywords) {
      if (kw.includes(q) || q.includes(kw)) return item;
    }
  }
  return undefined;
}
