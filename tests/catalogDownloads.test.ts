import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CATALOG_DRIVE_FOLDER_URL,
  CATALOG_DOWNLOAD_ITEMS,
  renderCatalogDownloadList,
  findCatalogByQuery,
} from "../src/catalog/downloads.js";
import { COPY } from "../src/conversation/copy.js";

test("CATALOG_DOWNLOAD_ITEMS contains all 12 catalog PDFs with valid drive links", () => {
  assert.equal(CATALOG_DOWNLOAD_ITEMS.length, 12);

  const basic = CATALOG_DOWNLOAD_ITEMS.filter((i) => i.tier === "Basic");
  const standard = CATALOG_DOWNLOAD_ITEMS.filter((i) => i.tier === "Standard");
  const premium = CATALOG_DOWNLOAD_ITEMS.filter((i) => i.tier === "Premium");

  assert.equal(basic.length, 4);
  assert.equal(standard.length, 2);
  assert.equal(premium.length, 6);

  for (const item of CATALOG_DOWNLOAD_ITEMS) {
    assert.ok(item.fileId.length > 20, `File ID too short for ${item.name}`);
    assert.ok(item.viewUrl.includes(item.fileId), `viewUrl missing fileId for ${item.name}`);
    assert.ok(item.downloadUrl.includes(item.fileId), `downloadUrl missing fileId for ${item.name}`);
  }
});

test("renderCatalogDownloadList produces an ordered catalog message with Google Drive links", () => {
  const rendered = renderCatalogDownloadList();

  assert.ok(rendered.includes(CATALOG_DRIVE_FOLDER_URL));
  assert.ok(rendered.includes("Basic T-Shirts"));
  assert.ok(rendered.includes("Standard T-Shirts"));
  assert.ok(rendered.includes("Premium Brand T-Shirts"));

  // Check order of appearance
  const basicIdx = rendered.indexOf("Basic T-Shirts");
  const standardIdx = rendered.indexOf("Standard T-Shirts");
  const premiumIdx = rendered.indexOf("Premium Brand T-Shirts");

  assert.ok(basicIdx < standardIdx, "Basic should appear before Standard");
  assert.ok(standardIdx < premiumIdx, "Standard should appear before Premium");

  // Every single catalog file is included with its link
  for (const item of CATALOG_DOWNLOAD_ITEMS) {
    assert.ok(rendered.includes(item.name), `Missing name ${item.name} in rendered list`);
    assert.ok(rendered.includes(item.viewUrl), `Missing viewUrl for ${item.name}`);
  }
});

test("COPY.catalogsListMessage matches rendered list and menu title is set", () => {
  assert.equal(COPY.catalogsMenuTitle, "📥 Download Catalogs");
  assert.equal(COPY.catalogsListMessage, renderCatalogDownloadList());
});

test("findCatalogByQuery matches specific catalog keywords", () => {
  assert.equal(findCatalogByQuery("adidas")?.name, "Adidas Catalogue");
  assert.equal(findCatalogByQuery("reebok")?.name, "Reebok Catalogue");
  assert.equal(findCatalogByQuery("van heusen")?.name, "Van Heusen Catalogue");
  assert.equal(findCatalogByQuery("nano dry")?.name, "Stellars Nano-Dry");
  assert.equal(findCatalogByQuery("softberry men")?.name, "Stellars Softberry Golf Polo (Men)");
  assert.equal(findCatalogByQuery("softberry women")?.name, "Stellars Softberry Golf Polo (Women)");
  assert.equal(findCatalogByQuery("cotton polo")?.name, "Cotton Polo");

  // Generic queries return undefined (so they trigger full list)
  assert.equal(findCatalogByQuery("catalog"), undefined);
  assert.equal(findCatalogByQuery("pdf"), undefined);
  assert.equal(findCatalogByQuery("download"), undefined);
});
