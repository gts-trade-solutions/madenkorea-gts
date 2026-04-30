"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { createClient } from "@supabase/supabase-js";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import {
  Download,
  FileSpreadsheet,
  Image as ImageIcon,
  Upload,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

/* -------------------------------------------------------------------------------------------------
 * Supabase (browser client)
 * -------------------------------------------------------------------------------------------------*/
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );
}
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

/* -------------------------------------------------------------------------------------------------
 * Types
 * -------------------------------------------------------------------------------------------------*/
type ProductFormProps = {
  onSave?: (product: any) => void; // not used on bulk-only screen; kept for signature compatibility
  onCancel?: () => void; // not used
};

type BulkProductRow = {
  // core
  sku: string;
  slug: string;
  name: string;
  short_description?: string;
  description?: string;
  brand_slug: string;
  price?: number | null;
  currency?: string | null;
  country_of_origin?: string | null;
  volume_ml?: number | null;
  net_weight_g?: number | null;
  category_slug: string;
  is_published: boolean;
  hero_image_filename?: string | null;
  attributes_json?: string | null;

  // rich text (Markdown)
  ingredients_md?: string | null;
  key_features_md?: string | null;
  additional_details_md?: string | null;

  // JSON-ish
  faq?: Array<{ q: string; a: string }>;
  key_benefits?: string[];

  // badges
  made_in_korea?: boolean;
  is_vegetarian?: boolean;
  cruelty_free?: boolean;
  toxin_free?: boolean;
  paraben_free?: boolean;

  // pricing / merch / SEO
  compare_at_price?: number | null;
  sale_price?: number | null;
  sale_starts_at?: string | Date | number | null;
  sale_ends_at?: string | Date | number | null;
  is_featured?: string | boolean | null;
  featured_rank?: number | null;
  is_trending?: string | boolean | null;
  new_until?: string | Date | number | null;
  meta_title?: string | null;
  meta_description?: string | null;
  og_image_filename?: string | null;
};

type BulkMediaRow = {
  sku: string;
  filename: string;
  alt?: string | null;
  sort_order?: number | null;
};

type MyVendor = {
  id: string;
  status: "pending" | "approved" | "rejected" | "disabled";
};

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -------------------------------------------------------------------------------------------------*/
async function getMyVendorOrThrow(): Promise<MyVendor> {
  const {
    data: { user },
    error: uerr,
  } = await supabase.auth.getUser();
  if (uerr || !user)
    throw new Error("You must be logged in to import products");
  const { data, error } = await supabase.rpc("get_my_vendor");
  if (error) throw error;
  const v = (data?.[0] || null) as MyVendor | null;
  if (!v?.id) throw new Error("You do not have a vendor account yet");
  if (v.status !== "approved")
    throw new Error(
      `Your vendor account is '${v.status}'. Please wait for approval.`
    );
  return v;
}

const toInt = (v: any) =>
  v === "" || v == null ? null : parseInt(String(v), 10);
const excelSerialToISO = (n: number) => {
  const excelEpoch = new Date(Date.UTC(1899, 11, 30)); // 1899-12-30
  const ms = Math.round(n * 86400000);
  return new Date(excelEpoch.getTime() + ms).toISOString();
};
const toISODate = (v: any) => {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number") return excelSerialToISO(v);
  const d = new Date(String(v).trim());
  return isNaN(d.getTime()) ? null : d.toISOString();
};
const parseBool = (v: any) => {
  if (typeof v === "boolean") return v;
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes";
};
const toNumOrNull = (v: any) => (v === "" || v == null ? null : Number(v));
const safeJSON = (s?: string | null) => {
  if (!s) return {};
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
};

// put near your other helpers
const safeKeyPart = (s: string) =>
  s
    .normalize('NFKC')      // normalize unicode (kills NBSP surprises)
    .trim()                 // remove leading/trailing whitespace
    .replace(/\s+/g, '-')   // collapse spaces -> dashes
    .replace(/[^\w.\-]/g, '') // keep [A-Za-z0-9 _ . -], drop the rest


const parseBenefits = (v: any): string[] => {
  const s = (v ?? "").toString().trim();
  if (!s) return [];
  try {
    const j = JSON.parse(s);
    if (Array.isArray(j)) return j.map((x) => String(x).trim()).filter(Boolean);
  } catch {}
  return s
    .split(/[\n;,]/)
    .map((x) => x.trim())
    .filter(Boolean);
};
const parseFAQ = (v: any): Array<{ q: string; a: string }> => {
  const s = (v ?? "").toString().trim();
  if (!s) return [];
  try {
    const j = JSON.parse(s);
    if (Array.isArray(j))
      return j
        .map((x: any) => ({
          q: String(x?.q ?? "").trim(),
          a: String(x?.a ?? "").trim(),
        }))
        .filter((x) => x.q || x.a);
  } catch {}
  return s
    .split("||")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const [q, a] = pair.split("|");
      return {
        q: String(q ?? "")
          .replace(/^Q:\s*/i, "")
          .trim(),
        a: String(a ?? "")
          .replace(/^A:\s*/i, "")
          .trim(),
      };
    })
    .filter((x) => x.q || x.a);
};

const buildChosenFileMap = (files: File[]) => {
  const m = new Map<string, true>();
  for (const f of files || []) m.set(f.name, true);
  return m;
};
const buildMediaBySku = (media: { sku?: string; filename?: string }[]) => {
  const m = new Map<string, Set<string>>();
  for (const row of media || []) {
    const sku = String(row.sku ?? "").trim();
    const file = String(row.filename ?? "").trim();
    if (!sku || !file) continue;
    let set = m.get(sku);
    if (!set) {
      set = new Set();
      m.set(sku, set);
    }
    set.add(file);
  }
  return m;
};

// small concurrency util
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, i: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  const running = new Set<Promise<void>>();
  let i = 0;
  const enqueue = () => {
    if (i >= items.length) return Promise.resolve();
    const idx = i++;
    const p = (async () => {
      results[idx] = await mapper(items[idx], idx);
    })();
    running.add(p);
    const clean = p.then(() => running.delete(p));
    let r = Promise.resolve();
    if (running.size >= limit) r = Promise.race(running) as Promise<void>;
    return r.then(() => enqueue());
  };
  await enqueue();
  await Promise.all(running);
  return results;
}

/* -------------------------------------------------------------------------------------------------
 * Component (Bulk Upload only)
 * -------------------------------------------------------------------------------------------------*/
export function ProductForm(_props: ProductFormProps) {
  // files & parsed data
  const [bulkExcelFile, setBulkExcelFile] = useState<File | null>(null);
  const [bulkMediaFiles, setBulkMediaFiles] = useState<File[]>([]);
  const [bulkProducts, setBulkProducts] = useState<BulkProductRow[]>([]);
  const [bulkMedia, setBulkMedia] = useState<BulkMediaRow[]>([]);
  const [bulkOverwriteImages, setBulkOverwriteImages] = useState(true);
  const [bulkReplaceImages, setBulkReplaceImages] = useState(true);

  // progress + state
  const [bulkValidated, setBulkValidated] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgressMsg, setBulkProgressMsg] = useState("");
  const [bulkProgress, setBulkProgress] = useState(0); // percent 0..100
  const [bulkIssues, setBulkIssues] = useState<string[]>([]);

  const bulkMediaFileMap = new Map<string, File>(
    bulkMediaFiles.map((f) => [f.name, f])
  );

  const resetBulkState = () => {
    setBulkIssues([]);
    setBulkProgress(0);
    setBulkProgressMsg("");
    setBulkValidated(false);
  };
  const resetBulkSession = () => {
    setBulkExcelFile(null);
    setBulkMediaFiles([]);
    setBulkProducts([]);
    setBulkMedia([]);
    resetBulkState();
  };

  /* ------------------------------- Template download --------------------------------- */
  const bulkDownloadTemplate = async () => {
    const [{ data: cats }, { data: brs }] = await Promise.all([
      supabase.from("categories").select("slug").order("slug"),
      supabase.from("brands").select("slug").order("slug"),
    ]);
    const categorySlugs = (cats || []).map((c) => c.slug);
    const brandSlugs = (brs || []).map((b) => b.slug);

    const wb = new ExcelJS.Workbook();
    const wsProd = wb.addWorksheet("Products");

    const prodHeaders = [
      // core
      "sku",
      "slug",
      "name",
      "short_description",
      "description",
      "brand_slug",
      "price",
      "currency",
      "country_of_origin",
      "volume_ml",
      "net_weight_g",
      "category_slug",
      "is_published",
      "hero_image_filename",
      "attributes_json",

      // pricing / merch / SEO
      "compare_at_price",
      "sale_price",
      "sale_starts_at",
      "sale_ends_at",
      "is_featured",
      "featured_rank",
      "is_trending",
      "new_until",
      "meta_title",
      "meta_description",
      "og_image_filename",

      // rich text (Markdown)
      "ingredients_md",
      "key_features_md",
      "additional_details_md",

      // JSON-ish
      "faq",
      "key_benefits",

      // badge booleans
      "made_in_korea",
      "is_vegetarian",
      "cruelty_free",
      "toxin_free",
      "paraben_free",
    ];
    wsProd.addRow(prodHeaders);

    // example row
    wsProd.addRow([
      "ST-SSP-50",
      "skintectonic-soothing-sun-plus",
      "Skintectonic Soothing Sun Plus",
      "Lightweight SPF 50+ sunscreen",
      "Broad-spectrum sunscreen with soothing ingredients.",
      "skintectonic",
      "",
      "INR",
      "Korea",
      "50",
      "",
      "sunscreen",
      "TRUE",
      "skintectonic-soothing-sun-plus-hero.jpg",
      '{"SPF":"50+","PA":"PA++++"}',
      "",
      "",
      "",
      "",
      "FALSE",
      "",
      "FALSE",
      "",
      "",
      "",
      "skintectonic-soothing-sun-plus-og.jpg",
      "**Key Ingredients**\n- Niacinamide (5%)\n- Green Tea Extract",
      "- Lightweight texture\n- Absorbs quickly",
      "**How to Use**\n1. Cleanse\n2. Apply 2–3 drops\n\n**Storage**\n- Keep below 30°C",
      "Q: Is it for oily skin?|A: Yes || Q: Fragrance free?|A: Yes",
      "Hydrates; Brightens",
      "TRUE",
      "TRUE",
      "TRUE",
      "TRUE",
      "TRUE",
    ]);

    // widths
    wsProd.columns = Array.from({ length: prodHeaders.length }, (_, i) => ({
      width:
        [
          16, 34, 40, 42, 60, 18, 12, 10, 18, 12, 12, 18, 14, 34, 80, 16, 14,
          16, 16, 12, 14, 12, 16, 40, 60, 28, 22, 22, 28, 24, 20, 14, 14, 14,
          16, 16,
        ].at(i) || 22,
    }));

    // Lookups (veryHidden)
    const wsCat = wb.addWorksheet("CategoryLookup");
    wsCat.addRow(["slug"]);
    categorySlugs.forEach((s) => wsCat.addRow([s]));
    wsCat.state = "veryHidden";
    const wsBrand = wb.addWorksheet("BrandLookup");
    wsBrand.addRow(["slug"]);
    brandSlugs.forEach((s) => wsBrand.addRow([s]));
    wsBrand.state = "veryHidden";

    // validations
    const brandFormula = `BrandLookup!$A$2:$A$${Math.max(
      2,
      1 + brandSlugs.length
    )}`;
    const catFormula = `CategoryLookup!$A$2:$A$${Math.max(
      2,
      1 + categorySlugs.length
    )}`;
    const startRow = 2,
      endRow = 5000;
    const col = (n: number) => wsProd.getColumn(n).letter;

    const C_BRAND = prodHeaders.indexOf("brand_slug") + 1;
    const C_CAT = prodHeaders.indexOf("category_slug") + 1;
    const C_CMP = prodHeaders.indexOf("compare_at_price") + 1;
    const C_SAL = prodHeaders.indexOf("sale_price") + 1;
    const C_SST = prodHeaders.indexOf("sale_starts_at") + 1;
    const C_SEN = prodHeaders.indexOf("sale_ends_at") + 1;
    const C_FRK = prodHeaders.indexOf("featured_rank") + 1;
    const C_NEW = prodHeaders.indexOf("new_until") + 1;

    const BOOL_COLS = [
      "is_published",
      "is_featured",
      "is_trending",
      "made_in_korea",
      "is_vegetarian",
      "cruelty_free",
      "toxin_free",
      "paraben_free",
    ]
      .map((h) => prodHeaders.indexOf(h) + 1)
      .filter((n) => n > 0);

    for (let r = startRow; r <= endRow; r++) {
      const A1 = (c: number) => `${col(c)}${r}`;

      wsProd.getCell(A1(C_BRAND)).dataValidation = brandSlugs.length
        ? { type: "list", allowBlank: false, formulae: [brandFormula] }
        : { type: "list", allowBlank: true, formulae: ['""'] };

      wsProd.getCell(A1(C_CAT)).dataValidation = categorySlugs.length
        ? { type: "list", allowBlank: false, formulae: [catFormula] }
        : { type: "list", allowBlank: true, formulae: ['""'] };

      wsProd.getCell(A1(C_CMP)).dataValidation = {
        type: "decimal",
        allowBlank: true,
      };
      wsProd.getCell(A1(C_SAL)).dataValidation = {
        type: "decimal",
        allowBlank: true,
      };
      wsProd.getCell(A1(C_SST)).dataValidation = {
        type: "date",
        allowBlank: true,
      };
      wsProd.getCell(A1(C_SEN)).dataValidation = {
        type: "date",
        allowBlank: true,
      };
      wsProd.getCell(A1(C_FRK)).dataValidation = {
        type: "whole",
        allowBlank: true,
        operator: "greaterThanOrEqual",
        formulae: [0],
      };
      wsProd.getCell(A1(C_NEW)).dataValidation = {
        type: "date",
        allowBlank: true,
      };

      for (const c of BOOL_COLS) {
        wsProd.getCell(A1(c)).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: ['"TRUE,FALSE"'],
        };
      }
    }

    const wsMedia = wb.addWorksheet("Media");
    wsMedia.addRow(["sku", "filename", "alt", "sort_order"]);
    wsMedia.addRow([
      "ST-SSP-50",
      "skintectonic-soothing-sun-plus-hero.jpg",
      "Front angle",
      0,
    ]);
    wsMedia.addRow([
      "ST-SSP-50",
      "skintectonic-soothing-sun-plus-og.jpg",
      "OG image",
      1,
    ]);

    const blob = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(
      new Blob([blob], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "bulk_products_template.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ------------------------------- Excel choose & parse --------------------------------- */
  const bulkOnExcelChosen = async (file: File | null) => {
    if (!file) return;
    resetBulkState();
    setBulkExcelFile(file);
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: "array" });
    const wsProd = wb.Sheets["Products"];
    const wsMedia = wb.Sheets["Media"];
    if (!wsProd || !wsMedia) {
      toast.error("Workbook must contain 'Products' and 'Media'");
      return;
    }
    const prodRows = XLSX.utils.sheet_to_json<any>(wsProd, {
      defval: "",
      raw: true,
    });
    const mediaRows = XLSX.utils.sheet_to_json<any>(wsMedia, {
      defval: "",
      raw: true,
    });

    const parsedProducts: BulkProductRow[] = prodRows
      .map((r: any) => ({
        sku: String(r.sku ?? r.SKU ?? "").trim(),
        slug: String(r.slug ?? "").trim(),
        name: String(r.name ?? "").trim(),
        short_description:
          String(r.short_description ?? "").trim() || undefined,
        description: String(r.description ?? "").trim() || undefined,
        brand_slug: String(r.brand_slug ?? "").trim(),
        price: toNumOrNull(r.price),
        currency: r.currency ? String(r.currency).trim() : null,
        country_of_origin: r.country_of_origin
          ? String(r.country_of_origin).trim()
          : null,
        volume_ml: toNumOrNull(r.volume_ml),
        net_weight_g: toNumOrNull(r.net_weight_g),
        category_slug: String(r.category_slug ?? "").trim(),
        is_published: parseBool(r.is_published),
        hero_image_filename: r.hero_image_filename
          ? String(r.hero_image_filename).trim()
          : null,
        attributes_json: r.attributes_json
          ? String(r.attributes_json).trim()
          : null,

        // rich text
        ingredients_md: String(r.ingredients_md ?? "").trim() || undefined,
        key_features_md: String(r.key_features_md ?? "").trim() || undefined,
        additional_details_md:
          String(r.additional_details_md ?? "").trim() || undefined,

        // arrays
        faq: parseFAQ(r.faq),
        key_benefits: parseBenefits(r.key_benefits),

        // badges
        made_in_korea: parseBool(r.made_in_korea),
        is_vegetarian: parseBool(r.is_vegetarian),
        cruelty_free: parseBool(r.cruelty_free),
        toxin_free: parseBool(r.toxin_free),
        paraben_free: parseBool(r.paraben_free),

        // pricing / merch / SEO
        compare_at_price: toNumOrNull(r.compare_at_price),
        sale_price: toNumOrNull(r.sale_price),
        sale_starts_at: toISODate(r.sale_starts_at),
        sale_ends_at: toISODate(r.sale_ends_at),
        is_featured:
          typeof r.is_featured === "boolean"
            ? r.is_featured
            : String(r.is_featured ?? "").trim(),
        featured_rank: toInt(r.featured_rank),
        is_trending:
          typeof r.is_trending === "boolean"
            ? r.is_trending
            : String(r.is_trending ?? "").trim(),
        new_until: toISODate(r.new_until),
        meta_title: r.meta_title ? String(r.meta_title).trim() : null,
        meta_description: r.meta_description
          ? String(r.meta_description).trim()
          : null,
        og_image_filename: r.og_image_filename
          ? String(r.og_image_filename).trim()
          : null,
      }))
      .filter((p) => p.sku || p.slug || p.name);

    const parsedMedia: BulkMediaRow[] = mediaRows
      .map((r: any) => ({
        sku: String(r.sku ?? r.SKU ?? "").trim(),
        filename: String(r.filename ?? r.FILENAME ?? "").trim(),
        alt: r.alt ? String(r.alt).trim() : null,
        sort_order: toNumOrNull(r.sort_order),
      }))
      .filter((m) => m.sku && m.filename);

    setBulkProducts(parsedProducts);
    setBulkMedia(parsedMedia);
    toast.success(
      `Parsed ${parsedProducts.length} products and ${parsedMedia.length} media rows`
    );
  };

  /* ------------------------------- Media choose --------------------------------- */
  const bulkOnMediaChosen = (files: FileList | null) => {
    if (!files) return;
    resetBulkState();
    setBulkMediaFiles((prev) => [...prev, ...Array.from(files)]);
  };

  /* ------------------------------- Validate --------------------------------- */
  const bulkValidateAll = async (): Promise<boolean> => {
    const issues: string[] = [];
    setBulkIssues([]);
    setBulkValidated(false);
    setBulkProgress(0);

    try {
      await getMyVendorOrThrow();
    } catch (e: any) {
      issues.push(e?.message || "Vendor not approved");
      setBulkIssues(issues);
      return false;
    }

    if (!bulkProducts?.length) {
      issues.push(
        "No products found in the Excel. Please load the Products sheet."
      );
      setBulkIssues(issues);
      setBulkProgress(100);
      return false;
    }


    
    const [catRes, brRes] = await Promise.all([
      supabase.from("categories").select("slug"),
      supabase.from("brands").select("slug"),
    ]);
    const categorySet = new Set((catRes.data ?? []).map((x: any) => x.slug));
    const brandSet = new Set((brRes.data ?? []).map((x: any) => x.slug));

    const chosenFileMap = buildChosenFileMap(bulkMediaFiles || []);
    const mediaBySku = buildMediaBySku(bulkMedia || []);
    const isNonNeg = (v: any) => v == null || Number(v) >= 0;

    for (let i = 0; i < bulkProducts.length; i++) {

      
      const p = bulkProducts[i]!;
      const label = p.slug || p.sku || `row#${i + 2}`;


      
      const missing: string[] = [];
      if (!p.sku) missing.push("sku");
      if (!p.slug) missing.push("slug");
      if (!p.name) missing.push("name");
      if (!p.category_slug) missing.push("category_slug");
      if (!p.brand_slug) missing.push("brand_slug");
      if (missing.length)
        issues.push(`Product '${label}': missing → ${missing.join(", ")}`);

      if (p.category_slug && !categorySet.has(p.category_slug)) {
        issues.push(
          `Product '${label}': category_slug '${p.category_slug}' not found`
        );
      }
      if (p.brand_slug && !brandSet.has(p.brand_slug)) {
        issues.push(
          `Product '${label}': brand_slug '${p.brand_slug}' not found`
        );
      }

      const mediaSet = mediaBySku.get(p.sku) || new Set<string>();
      if (mediaSet.size === 0)
        issues.push(
          `Product '${label}': no Media rows found for SKU '${p.sku}'`
        );

      if (!p.hero_image_filename) {
        issues.push(`Product '${label}': hero_image_filename is required`);
      } else {
        const hero = p.hero_image_filename.trim();
        if (!mediaSet.has(hero))
          issues.push(
            `Product '${label}': hero_image_filename '${hero}' not listed in Media sheet`
          );
        if (!chosenFileMap.has(hero))
          issues.push(
            `Product '${label}': hero_image_filename '${hero}' not among selected files`
          );
      }
      if (p.og_image_filename) {
        const og = p.og_image_filename.trim();
        if (!mediaSet.has(og))
          issues.push(
            `Product '${label}': og_image_filename '${og}' not listed in Media sheet`
          );
        if (!chosenFileMap.has(og))
          issues.push(
            `Product '${label}': og_image_filename '${og}' not among selected files`
          );
      }
      for (const fname of mediaSet) {
        if (!chosenFileMap.has(fname))
          issues.push(
            `SKU '${p.sku}': media file '${fname}' not among selected files`
          );
      }

      (
        [
          "price",
          "compare_at_price",
          "sale_price",
          "volume_ml",
          "net_weight_g",
        ] as const
      ).forEach((k) => {
        const v = (p as any)[k];
        if (!isNonNeg(v)) issues.push(`Product '${label}': ${k} must be ≥ 0`);
      });

      if (
        p.price != null &&
        p.compare_at_price != null &&
        Number(p.compare_at_price) < Number(p.price)
      ) {
        issues.push(`Product '${label}': compare_at_price must be ≥ price`);
      }
      if (p.sale_price != null) {
        if (p.compare_at_price == null)
          issues.push(
            `Product '${label}': sale_price requires compare_at_price`
          );
        else if (Number(p.sale_price) > Number(p.compare_at_price))
          issues.push(
            `Product '${label}': sale_price must be ≤ compare_at_price`
          );
      }

      if (p.sale_starts_at && p.sale_ends_at) {
        const st = new Date(p.sale_starts_at);
        const en = new Date(p.sale_ends_at);
        if (isNaN(st.getTime()) || isNaN(en.getTime()) || st > en) {
          issues.push(
            `Product '${label}': sale_starts_at must be ≤ sale_ends_at`
          );
        }
      }

      if (i % 10 === 0) {
        setBulkProgress(
          Math.round(((i + 1) / Math.max(1, bulkProducts.length)) * 100)
        );
      }
    }

    setBulkIssues(issues);
    const ok = issues.length === 0;
    setBulkValidated(ok);
    setBulkProgress(100);
    if (ok) toast.success("Validation passed");
    else toast.error("Validation found issues");
    return ok;
  };

  /* ------------------------------- Upload images --------------------------------- */
const bulkUploadImages = async () => {
  setBulkBusy(true);
  setBulkProgressMsg("Uploading images…");
  setBulkProgress(0);

  try {
    const tasks: { key: string; file: File }[] = [];

    for (const m of bulkMedia) {
      const f = bulkMediaFileMap.get(m.filename);
      if (!f) continue;

      const safeSku  = safeKeyPart(m.sku || '');
      const safeName = safeKeyPart(m.filename);
      const key      = `${safeSku}/${safeName}`;

      // rename the browser File so DB + storage match
      const renamed = new File([f], safeName, { type: f.type });
      tasks.push({ key, file: renamed });
    }

    let done = 0;
    await mapLimit(tasks, 3, async (t) => {
      const { error } = await supabase.storage
        .from("product-media")
        .upload(t.key, t.file, {
          upsert: bulkOverwriteImages,
          cacheControl: "3600",
          contentType: t.file.type || undefined,
        });
      if (error) throw new Error(`${t.key}: ${error.message}`);
      done += 1;
      setBulkProgress(Math.round((done / tasks.length) * 100));
    });

    toast.success("Images uploaded");
  } catch (e: any) {
    toast.error(e?.message || "Upload failed");
  } finally {
    setBulkProgressMsg("");
    setBulkBusy(false);
  }
};


  /* ------------------------------- Upsert DB --------------------------------- */
 /* ------------------------------- Upsert DB --------------------------------- */
const bulkUpsertAll = async (): Promise<{ ok: boolean; issues: string[] }> => {
  const issues: string[] = [];
  setBulkIssues([]);
  setBulkProgress(0);

  // 1) Get my vendor (and stop if not approved)
  let myVendor: MyVendor;
  try {
    myVendor = await getMyVendorOrThrow();
  } catch (e: any) {
    issues.push(e?.message || "Vendor not approved");
    setBulkIssues(issues);
    return { ok: false, issues };
  }

  // 2) Preload dictionaries
  const [[catRes, brRes]] = await Promise.all([
    Promise.all([
      supabase.from("categories").select("id,slug"),
      supabase.from("brands").select("id,slug"),
    ]),
  ]);
  const catMap = new Map<string, string>((catRes.data ?? []).map((c: any) => [c.slug, c.id]));
  const brMap  = new Map<string, string>((brRes.data ?? []).map((b: any) => [b.slug, b.id]));

  // 3) Group media by SKU
  const mediaBySku = new Map<string, BulkMediaRow[]>();
  for (const m of bulkMedia) {
    const sku = m.sku?.trim();
    const filename = m.filename?.trim();
    if (!sku || !filename) continue;
    const arr = mediaBySku.get(sku) ?? [];
    arr.push({ ...m, sort_order: m.sort_order == null ? null : Number(m.sort_order) });
    mediaBySku.set(sku, arr);
  }

  // 4) Upsert each product with vendor_id
  for (let i = 0; i < bulkProducts.length; i++) {
    const p = bulkProducts[i];
    const label = p.slug || p.sku || `row#${i + 2}`;

    const category_id = p.category_slug ? catMap.get(p.category_slug) : undefined;
    const brand_id    = p.brand_slug ? brMap.get(p.brand_slug) : undefined;
    if (!category_id) { issues.push(`Upsert skipped '${label}': category '${p.category_slug}' not found`); continue; }
    if (!brand_id)    { issues.push(`Upsert skipped '${label}': brand '${p.brand_slug}' not found`); continue; }

    // If a product with this slug exists and belongs to another vendor, skip
    const { data: existing, error: exErr } = await supabase
      .from("products")
      .select("id,vendor_id")
      .eq("slug", p.slug)
      .maybeSingle();

    if (exErr) {
      issues.push(`Lookup failed for '${label}': ${exErr.message}`);
      continue;
    }
    if (existing && existing.vendor_id && existing.vendor_id !== myVendor.id) {
      issues.push(`Slug '${p.slug}' already belongs to another vendor. Skipping.`);
      continue;
    }

  const safeSku  = safeKeyPart(p.sku || '');
  const heroPath = p.hero_image_filename
    ? `${safeSku}/${safeKeyPart(p.hero_image_filename)}`
    : null;
  const ogPath   = p.og_image_filename
    ? `${safeSku}/${safeKeyPart(p.og_image_filename)}`
    : null;

    const payload = {
      // core
      sku: p.sku || null,
      slug: p.slug,
      name: p.name,
      short_description: p.short_description || null,
      description: p.description || null,
      brand_id,
      price: toNumOrNull(p.price),
      currency: p.currency || null,
      country_of_origin: p.country_of_origin || null,
      volume_ml: toNumOrNull(p.volume_ml),
      net_weight_g: toNumOrNull(p.net_weight_g),
      attributes: safeJSON(p.attributes_json),
      category_id,
      is_published: parseBool(p.is_published),
      hero_image_path: heroPath,

      // ✅ ensure ownership
      vendor_id: myVendor.id,

      // rich text & JSON
      ingredients_md: p.ingredients_md || null,
      key_features_md: p.key_features_md || null,
      additional_details_md: p.additional_details_md || null,
      faq: p.faq ?? [],
      key_benefits: p.key_benefits ?? [],

      // badges
      made_in_korea: parseBool(p.made_in_korea),
      is_vegetarian: parseBool(p.is_vegetarian),
      cruelty_free: parseBool(p.cruelty_free),
      toxin_free: parseBool(p.toxin_free),
      paraben_free: parseBool(p.paraben_free),

      // pricing / merch
      compare_at_price: toNumOrNull(p.compare_at_price),
      sale_price: toNumOrNull(p.sale_price),
      sale_starts_at: toISODate(p.sale_starts_at),
      sale_ends_at: toISODate(p.sale_ends_at),
      is_featured: parseBool(p.is_featured),
      featured_rank: p.featured_rank == null ? null : toInt(p.featured_rank),
      is_trending: parseBool(p.is_trending),
      new_until: toISODate(p.new_until),
      meta_title: p.meta_title || null,
      meta_description: p.meta_description || null,
      og_image_path: ogPath,
    };

    const { data: prodRow, error: upErr } = await supabase
      .from("products")
      .upsert(payload, { onConflict: "slug" })
      .select("id")
      .single();

      // Optional cleanup
  if (bulkReplaceImages) {
    await supabase.from("product_images").delete().eq("product_id", prodRow.id);
  }

    if (upErr || !prodRow?.id) {
      issues.push(`Upsert failed '${label}': ${upErr?.message ?? "no id returned"}`);
      continue;
    }

    const product_id = prodRow.id as string;

    // Optional: clean & insert product_images
    if (bulkReplaceImages) {
      const { error: delErr } = await supabase.from("product_images").delete().eq("product_id", product_id);
      if (delErr) issues.push(`Images cleanup failed '${label}': ${delErr.message}`);
    }
    const mediaRows = (mediaBySku.get(p.sku) || []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    if (mediaRows.length) {
      const rowsToInsert = mediaRows.map((m) => ({
        product_id,
        storage_path: `${safeSku}/${safeKeyPart(m.filename)}`,
        alt: m.alt ?? null,
        sort_order: m.sort_order ?? 0,
      }));
      const { error: insErr } = await supabase.from("product_images").insert(rowsToInsert);
      if (insErr) issues.push(`Insert images failed '${label}': ${insErr.message}`);
    } else {
      issues.push(`No media rows to insert for '${label}'`);
    }

    if (i % 5 === 0) {
      setBulkProgress(Math.round(((i + 1) / Math.max(1, bulkProducts.length)) * 100));
    }
  }

  setBulkProgress(100);
  setBulkIssues(issues);
  return { ok: issues.length === 0, issues };
};


  /* ------------------------------- Run all --------------------------------- */
  const bulkRunAll = async () => {
    setBulkBusy(true);
    try {
      const ok = await bulkValidateAll();
      if (!ok) return;
      await bulkUploadImages();
      await bulkUpsertAll();
    } finally {
      setBulkBusy(false);
    }
  };

  /* ------------------------------- UI (bulk only) --------------------------------- */
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Bulk Upload — Template</CardTitle>
          <CardDescription>
            Download Excel template (includes your categories/brands lookup).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button type="button" onClick={bulkDownloadTemplate}>
            <Download className="mr-2 h-4 w-4" /> Download Excel Template
          </Button>
          {bulkProgressMsg && (
            <div className="text-sm text-muted-foreground">
              {bulkProgressMsg}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upload Excel</CardTitle>
          <CardDescription>
            Choose the filled template. We'll parse Products & Media.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => bulkOnExcelChosen(e.target.files?.[0] || null)}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              document
                .querySelector<HTMLInputElement>(
                  'input[type=file][accept=".xlsx,.xls"]'
                )
                ?.click()
            }
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Choose Excel
          </Button>
          {bulkExcelFile && (
            <div className="text-sm text-muted-foreground">
              Selected: {bulkExcelFile.name}
            </div>
          )}
          <Separator />
          <div className="grid gap-2 text-sm">
            <div>
              <strong>Products:</strong> {bulkProducts.length}
            </div>
            <div>
              <strong>Media rows:</strong> {bulkMedia.length}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Select Images</CardTitle>
          <CardDescription>
            Pick images referenced in Excel. Stored as{" "}
            <code>product-media/sku/filename</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => bulkOnMediaChosen(e.target.files)}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              document
                .querySelectorAll("input[type=file][multiple]")[0]
                ?.click()
            }
          >
            <ImageIcon className="mr-2 h-4 w-4" /> Choose Images
          </Button>
          <div className="flex items-center gap-2">
            <input
              id="bulk-upsert"
              type="checkbox"
              className="h-4 w-4"
              checked={bulkOverwriteImages}
              onChange={(e) => setBulkOverwriteImages(e.target.checked)}
            />
            <Label htmlFor="bulk-upsert" className="text-sm">
              Overwrite existing files (upsert)
            </Label>
          </div>
          {bulkMediaFiles.length > 0 && (
            <div className="rounded border p-3 text-sm">
              <div className="mb-2 font-medium">
                Selected files ({bulkMediaFiles.length}):
              </div>
              <div className="max-h-48 overflow-auto font-mono text-xs leading-6">
                {bulkMediaFiles.map((f, i) => (
                  <div key={i}>{f.name}</div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Validate & Import</CardTitle>
          <CardDescription>
            Validate data, upload images, and upsert DB.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <input
                id="bulk-replace"
                type="checkbox"
                className="h-4 w-4"
                checked={bulkReplaceImages}
                onChange={(e) => setBulkReplaceImages(e.target.checked)}
              />
              <Label htmlFor="bulk-replace" className="text-sm">
                Replace existing product images
              </Label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={bulkRunAll}
              disabled={bulkBusy || !bulkProducts.length}
            >
              Start Import (Validate → Upload → Upsert)
            </Button>

            <details className="ml-2">
              <summary className="cursor-pointer text-sm text-muted-foreground">
                Advanced actions
              </summary>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  onClick={bulkValidateAll}
                  disabled={bulkBusy}
                >
                  <AlertTriangle className="mr-2 h-4 w-4" /> Run validation
                </Button>
                <Button
                  type="button"
                  onClick={bulkUploadImages}
                  disabled={bulkBusy || !bulkValidated}
                >
                  <Upload className="mr-2 h-4 w-4" /> Upload images
                </Button>
                <Button
                  type="button"
                  onClick={bulkUpsertAll}
                  disabled={bulkBusy || !bulkValidated}
                >
                  <Upload className="mr-2 h-4 w-4" /> Upsert DB
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetBulkSession}
                >
                  Reset bulk session
                </Button>
              </div>
            </details>
          </div>

          {(bulkProgressMsg || bulkProgress > 0) && (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">
                {bulkProgressMsg}
              </div>
              <div className="h-2 w-full bg-gray-200 rounded">
                <div
                  className="h-2 bg-blue-600 rounded"
                  style={{ width: `${bulkProgress}%` }}
                />
              </div>
            </div>
          )}

          {bulkIssues.length > 0 ? (
            <div className="rounded border p-3">
              <div className="mb-2 text-sm font-medium text-red-600">
                Issues ({bulkIssues.length}):
              </div>
              <ul className="list-disc pl-5 text-sm">
                {bulkIssues.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="text-sm text-green-700 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> No issues found
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview table */}
      {bulkProducts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Preview ({bulkProducts.length})</CardTitle>
            <CardDescription>Quick glance before importing.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left">
                <tr className="border-b">
                  <th className="py-2 pr-4">SKU</th>
                  <th className="py-2 pr-4">Slug</th>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Brand</th>
                  <th className="py-2 pr-4">Category</th>
                  <th className="py-2 pr-4">Price</th>
                  <th className="py-2 pr-4">Korea</th>
                  <th className="py-2 pr-4">Veg</th>
                  <th className="py-2 pr-4">Cruelty</th>
                  <th className="py-2 pr-4">Toxin</th>
                  <th className="py-2 pr-4">Paraben</th>
                  <th className="py-2 pr-4">Benefits</th>
                  <th className="py-2 pr-4">FAQ</th>
                </tr>
              </thead>
              <tbody>
                {bulkProducts.map((p, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 pr-4">{p.sku}</td>
                    <td className="py-2 pr-4">{p.slug}</td>
                    <td className="py-2 pr-4">{p.name}</td>
                    <td className="py-2 pr-4">{p.brand_slug}</td>
                    <td className="py-2 pr-4">{p.category_slug}</td>
                    <td className="py-2 pr-4">{p.price ?? ""}</td>
                    <td className="py-2 pr-4">{p.made_in_korea ? "✓" : ""}</td>
                    <td className="py-2 pr-4">{p.is_vegetarian ? "✓" : ""}</td>
                    <td className="py-2 pr-4">{p.cruelty_free ? "✓" : ""}</td>
                    <td className="py-2 pr-4">{p.toxin_free ? "✓" : ""}</td>
                    <td className="py-2 pr-4">{p.paraben_free ? "✓" : ""}</td>
                    <td className="py-2 pr-4">{p.key_benefits?.length ?? 0}</td>
                    <td className="py-2 pr-4">{p.faq?.length ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
