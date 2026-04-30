"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import ExcelJS from "exceljs"; // or: import * as ExcelJS from "exceljs";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  X,
  Upload,
  Trash2, Star, StarOff, Loader2,
  Plus,
  Download,
  FileSpreadsheet,
  Image as ImageIcon,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { mockCategories, mockBrands, mockVendors } from "@/lib/mock-data";
import type { Product } from "@/types";

interface ProductFormProps {
  product?: Product;
  onSave: (product: any) => void;
  onCancel: () => void;
}

import { createClient } from "@supabase/supabase-js";

// Inline Supabase client (browser)
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

// --- vendor helper: ensure logged in + approved vendor ---
type MyVendor = {
  id: string;
  status: "pending" | "approved" | "rejected" | "disabled";
};

async function getMyVendorOrThrow(): Promise<MyVendor> {
  const {
    data: { user },
    error: uerr,
  } = await supabase.auth.getUser();
  if (uerr || !user)
    throw new Error("You must be logged in to import products");

  const { data, error } = await supabase.rpc("get_my_vendor");
  if (error) throw error;

  const v = (data[0] || null) as MyVendor | null;
 
  if (!v?.id) throw new Error("You do not have a vendor account yet");
  if (v.status !== "approved")
    throw new Error(
      `Your vendor account is '${v.status}'. Please wait for approval.`
    );
  return v;
}

export function ProductForm({ product, onSave, onCancel }: ProductFormProps) {
  const [formData, setFormData] = useState({
    title: product?.title || "",
    handle: product?.handle || "",
    description: product?.description || "",
    brand_id: product?.brand_id || "",
    category_ids: product?.category_ids || [],
    price: product?.price || 0,
    compare_at_price: product?.compare_at_price || 0,
    sku: product?.sku || "",
    barcode: product?.barcode || "",
    images: product?.images || [],
    status: product?.status || "draft",
    inventory_qty: product?.inventory?.qty || 0,
    low_stock_threshold: product?.inventory?.low_stock_threshold || 10,
    vendor_id: product?.vendor_id || "",
    trending: product?.editorial_flags?.trending || false,
    bestseller: product?.editorial_flags?.bestseller || false,
    new_arrival: product?.editorial_flags?.new_arrival || false,
    featured: product?.editorial_flags?.featured || false,
    seo_title: product?.seo_title || "",
    seo_description: product?.seo_description || "",
    slug: product?.slug || "",
    name: product?.name || "",
    short_description: product?.short_description || "",
    country_of_origin: product?.country_of_origin || "",
    volume_ml: product?.volume_ml || 0,
    net_weight_g: product?.net_weight_g || 0,
    category_id: product?.category_id || "",
    hero_image_filename: "",
  });

  const [activeTab, setActiveTab] = useState("basic");

  const [imageUrl, setImageUrl] = useState("");

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSelectChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSwitchChange = (field: string, value: boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // --- added helpers ---
  const slugify = (s: string) =>
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");

  const handleChange = (e: any) => {
    const { name, value } = e.target as any;
    const numericFields = new Set([
      "price",
      "compare_at_price",
      "inventory_qty",
      "low_stock_threshold",
      // NEW:
      "volume_ml",
      "net_weight_g",
    ]);
    const next = numericFields.has(name)
      ? value === ""
        ? 0
        : Number(value)
      : value;
    handleInputChange(name, next);
  };

  const generateHandle = () => {
    const base = formData.name || formData.title || formData.handle || "";
    const s = slugify(base);
    handleInputChange("handle", s);
    handleInputChange("slug", s); // NEW
  };

  const handleCategoryToggle = (id: string) => {
    setFormData((prev: any) => {
      const exists = prev.category_ids.includes(id);
      return {
        ...prev,
        category_ids: exists
          ? prev.category_ids.filter((x: string) => x !== id)
          : [...prev.category_ids, id],
      };
    });
  };

  const addImage = () => {
    if (!imageUrl.trim()) {
      toast.error("Please enter an image URL");
      return;
    }
    setFormData((prev) => ({
      ...prev,
      images: [...prev.images, imageUrl.trim()],
    }));
    setImageUrl("");
  };


 const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const effectiveTitle = (formData.name ?? formData.title ?? "").trim();
    if (!effectiveTitle) {
      toast.error("Product title is required");
      return;
    }

    // if handle missing, generate from title (prevents accidental submit failures)
    let handleVal = (formData.handle || "").trim();
    if (!handleVal) {
      handleVal = slugify(effectiveTitle);
      handleInputChange("handle", handleVal);
    }

    // Accept old categories array OR new single select
    const hasCategory =
      (Array.isArray(formData.category_ids) &&
        formData.category_ids.length > 0) ||
      !!formData.category_id;
    if (!hasCategory) {
      toast.error("Please select at least one category");
      return;
    }

    // Accept legacy images array OR new uploaded/hero image
    const hasImages =
      (Array.isArray(formData.images) && formData.images.length > 0) ||
      !!formData.hero_image_path;
    if (!hasImages) {
      toast.error("Please add at least one product image");
      return;
    }

    const productData = {
      ...product,
      ...formData,
      title: effectiveTitle,
      name: effectiveTitle,
      handle: handleVal,

      // DB mapping kept as you had
      sku: formData.sku,
      slug: formData.slug || slugify(effectiveTitle),
      short_description: formData.short_description || null,
      description: formData.description || null,
      brand_id: formData.brand_id || null,
      category_id: formData.category_id || null,
      country_of_origin: formData.country_of_origin || null,
      volume_ml: formData.volume_ml || null,
      net_weight_g: formData.net_weight_g || null,
      hero_image_path:
        formData.hero_image_path ||
        (formData.sku && formData.hero_image_filename
          ? `${formData.sku}/${formData.hero_image_filename}`
          : null),

      inventory: {
        qty: formData.inventory_qty,
        track_inventory: true,
        low_stock_threshold: formData.low_stock_threshold,
      },
      editorial_flags: {
        trending: formData.trending,
        bestseller: formData.bestseller,
        new_arrival: formData.new_arrival,
        featured: formData.featured,
      },
    };

    onSave(productData);
  };

  // ===== Bulk Upload (Excel + Media to Supabase) =====
  // find: type BulkProductRow = { ... }
  type BulkProductRow = {
    // existing
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

    // NEW (pricing / flags / SEO)
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

  const [bulkExcelFile, setBulkExcelFile] = useState<File | null>(null);
  const [bulkMediaFiles, setBulkMediaFiles] = useState<File[]>([]);
  const [bulkProducts, setBulkProducts] = useState<BulkProductRow[]>([]);
  const [bulkMedia, setBulkMedia] = useState<BulkMediaRow[]>([]);
  const [bulkCategories, setBulkCategories] = useState<
    { id: string; slug: string }[]
  >([]);
  const [bulkBrands, setBulkBrands] = useState<{ id: string; slug: string }[]>(
    []
  );
  const [bulkOverwriteImages, setBulkOverwriteImages] = useState(false);
  const [bulkReplaceImages, setBulkReplaceImages] = useState(false);
  const [bulkValidated, setBulkValidated] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgressMsg, setBulkProgressMsg] = useState("");
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkIssues, setBulkIssues] = useState<string[]>([]);

  // Image upload state
const [imageFiles, setImageFiles] = useState<File[]>([]);
const [imagePreviews, setImagePreviews] = useState<{ file: File; url: string }[]>([]);
const [uploadedImages, setUploadedImages] = useState<
  Array<{ storage_path: string; alt?: string; sort_order: number; is_hero?: boolean }>
>([]);
const [uploading, setUploading] = useState(false);
const [overwrite, setOverwrite] = useState(true); // upsert to storage

// If you already track hero_image_path in formData, keep using it
// formData.hero_image_path || ""

const safeFilename = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9.-]+/g, "-").replace(/-+/g, "-");

const onSelectImages = (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = Array.from(e.target.files || []);
  setImageFiles(files);
  setImagePreviews(files.map((f) => ({ file: f, url: URL.createObjectURL(f) })));
};

const uploadSelectedImages = async () => {
  if (!formData.sku) {
    toast.error("SKU is required before uploading images.");
    return;
  }
  if (imageFiles.length === 0) {
    toast.message("No files selected.");
    return;
  }

  setUploading(true);
  const bucket = supabase.storage.from("product-media");
  const results: Array<{ storage_path: string; alt?: string; sort_order: number; is_hero?: boolean }> = [];
  let order = uploadedImages.length;

  for (const f of imageFiles) {
    const filename = safeFilename(f.name);
    const path = `${formData.sku}/${filename}`;

    const { error } = await bucket.upload(path, f, { upsert: overwrite });
    if (error) {
      // If overwrite disabled and file exists, Supabase returns a conflict
      toast.error(error.message);
      continue;
    }
    results.push({ storage_path: path, sort_order: order++ });
  }

  setUploadedImages((prev) => [...prev, ...results]);

  // set hero if none yet
  if (!formData.hero_image_path && results[0]) {
    handleInputChange("hero_image_path", results[0].storage_path);
    setUploadedImages((prev) =>
      prev.map((img) => ({ ...img, is_hero: img.storage_path === results[0].storage_path }))
    );
  }

  setUploading(false);
  setImageFiles([]);
  setImagePreviews([]);
  toast.success(`Uploaded ${results.length} image${results.length !== 1 ? "s" : ""}`);
};

const removeImage = async (path: string) => {
  const yes = confirm("Remove this image from storage and list?");
  if (!yes) return;
  await supabase.storage.from("product-media").remove([path]);
  setUploadedImages((prev) => prev.filter((i) => i.storage_path !== path));
  if (formData.hero_image_path === path) {
    handleInputChange("hero_image_path", "");
  }
};

const setHero = (path: string) => {
  handleInputChange("hero_image_path", path);
  setUploadedImages((prev) =>
    prev.map((img) => ({ ...img, is_hero: img.storage_path === path }))
  );
};


  const [dbBrands, setDbBrands] = useState<
    { id: string; name: string; slug: string }[]
  >([]);
  const [dbCategories, setDbCategories] = useState<
    { id: string; name: string; slug: string }[]
  >([]);

  useEffect(() => {
    (async () => {
      const [{ data: brands }, { data: cats }] = await Promise.all([
        supabase.from("brands").select("id,name,slug").order("name"),
        supabase.from("categories").select("id,name,slug").order("name"),
      ]);
      setDbBrands(brands ?? []);
      setDbCategories(cats ?? []);
    })();
  }, []);

  const bulkLoadBrands = async () => {
    const { data, error } = await supabase.from("brands").select("id, slug");
    if (error) throw error;
    setBulkBrands(data || []);
    return data || [];
  };

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
  // Fallbacks if not defined elsewhere:
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

  // Build a quick filename -> File map from selected files
  const buildChosenFileMap = (files: File[]) => {
    const m = new Map<string, true>();
    for (const f of files || []) m.set(f.name, true);
    return m;
  };

  // Build sku -> Set<filename> map from the Media sheet rows
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

  // Template download
  const bulkDownloadTemplate = async () => {
    // lookup
    const [{ data: cats }, { data: brs }] = await Promise.all([
      supabase.from("categories").select("slug").order("slug"),
      supabase.from("brands").select("slug").order("slug"),
    ]);
    const categorySlugs = (cats || []).map((c) => c.slug);
    const brandSlugs = (brs || []).map((b) => b.slug);

    const wb = new ExcelJS.Workbook();
    const wsProd = wb.addWorksheet("Products");

    // Columns (existing + NEW)
    const prodHeaders = [
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
      // --- NEW ---
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
    ];
    wsProd.addRow(prodHeaders);

    // Sample row
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
      // NEW
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
    ]);

    // widths
    wsProd.columns = [
      { width: 16 },
      { width: 34 },
      { width: 40 },
      { width: 42 },
      { width: 60 },
      { width: 18 },
      { width: 12 },
      { width: 10 },
      { width: 18 },
      { width: 12 },
      { width: 12 },
      { width: 18 },
      { width: 14 },
      { width: 34 },
      { width: 80 },
      // NEW
      { width: 16 },
      { width: 14 },
      { width: 16 },
      { width: 16 },
      { width: 12 },
      { width: 14 },
      { width: 12 },
      { width: 16 },
      { width: 40 },
      { width: 60 },
      { width: 28 },
    ];

    // Media sheet
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
    wsMedia.columns = [
      { width: 16 },
      { width: 46 },
      { width: 40 },
      { width: 12 },
    ];

    // Lookups (hidden)
    const wsCat = wb.addWorksheet("CategoryLookup");
    wsCat.addRow(["slug"]);
    categorySlugs.forEach((s) => wsCat.addRow([s]));
    wsCat.state = "veryHidden";

    const wsBrand = wb.addWorksheet("BrandLookup");
    wsBrand.addRow(["slug"]);
    brandSlugs.forEach((s) => wsBrand.addRow([s]));
    wsBrand.state = "veryHidden";

    // Data validation
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
    // Column positions (1-based)
    const C_BRAND = 6,
      C_CAT = 12;
    const C_CMP = prodHeaders.indexOf("compare_at_price") + 1;
    const C_SAL = prodHeaders.indexOf("sale_price") + 1;
    const C_SST = prodHeaders.indexOf("sale_starts_at") + 1;
    const C_SEN = prodHeaders.indexOf("sale_ends_at") + 1;
    const C_IFE = prodHeaders.indexOf("is_featured") + 1;
    const C_FRK = prodHeaders.indexOf("featured_rank") + 1;
    const C_ITR = prodHeaders.indexOf("is_trending") + 1;
    const C_NEW = prodHeaders.indexOf("new_until") + 1;

    for (let r = startRow; r <= endRow; r++) {
      wsProd.getCell(r, C_BRAND).dataValidation = brandSlugs.length
        ? { type: "list", allowBlank: false, formulae: [brandFormula] }
        : { type: "list", allowBlank: true, formulae: ['""'] };
      wsProd.getCell(r, C_CAT).dataValidation = categorySlugs.length
        ? { type: "list", allowBlank: false, formulae: [catFormula] }
        : { type: "list", allowBlank: true, formulae: ['""'] };

      // number/date/bool validations
      const A1 = (c: number) => `${col(c)}${r}`;
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
      wsProd.getCell(A1(C_IFE)).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: ['"TRUE,FALSE"'],
      };
      wsProd.getCell(A1(C_ITR)).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: ['"TRUE,FALSE"'],
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
    }

    // Download
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "product_import_template_v2.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Excel parsing
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
        // existing...
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

        // NEW
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

  // Media selection
  const bulkOnMediaChosen = (files: FileList | null) => {
    if (!files) return;
    resetBulkState();
    setBulkMediaFiles((prev) => [...prev, ...Array.from(files)]);
  };
  const bulkMediaFileMap = new Map<string, File>(
    bulkMediaFiles.map((f) => [f.name, f])
  );

  // Load categories
  const bulkLoadCategories = async () => {
    const { data, error } = await supabase
      .from("categories")
      .select("id, slug");
    if (error) throw error;
    setBulkCategories(data || []);
    return data || [];
  };

  // Validation
  const bulkValidateAll = async (): Promise<boolean> => {
    const issues: string[] = [];
    setBulkIssues([]);
    setBulkValidated(false);
    setBulkProgress({ phase: "validate", done: 0, total: bulkProducts.length });
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
      setBulkProgress({ phase: "validate", done: 1, total: 1 });
      return false;
    }

    // Prepare lookups
    const [catRes, brRes] = await Promise.all([
      supabase.from("categories").select("slug"),
      supabase.from("brands").select("slug"),
    ]);
    const categorySet = new Set((catRes.data ?? []).map((x: any) => x.slug));
    const brandSet = new Set((brRes.data ?? []).map((x: any) => x.slug));

    const chosenFileMap = buildChosenFileMap(bulkMediaFiles || []);
    const mediaBySku = buildMediaBySku(bulkMedia || []);

    const asBool = (v: any) => (typeof v === "boolean" ? v : parseBool(v));
    const isNonNeg = (v: any) => v == null || Number(v) >= 0;

    // Walk all products
    for (let i = 0; i < bulkProducts.length; i++) {
      const p = bulkProducts[i];
      const label = p.slug || p.sku || `row#${i + 2}`;

      // Required
      const missing: string[] = [];
      if (!p.sku) missing.push("sku");
      if (!p.slug) missing.push("slug");
      if (!p.name) missing.push("name");
      if (!p.category_slug) missing.push("category_slug");
      if (!p.brand_slug) missing.push("brand_slug");
      if (missing.length)
        issues.push(
          `Product '${label}': missing required fields → ${missing.join(", ")}`
        );

      // Dict checks
      if (p.category_slug && !categorySet.has(p.category_slug)) {
        issues.push(
          `Product '${label}': category_slug '${p.category_slug}' not found in database`
        );
      }
      if (p.brand_slug && !brandSet.has(p.brand_slug)) {
        issues.push(
          `Product '${label}': brand_slug '${p.brand_slug}' not found in database`
        );
      }

      // attributes_json validity
      if (p.attributes_json) {
        try {
          JSON.parse(p.attributes_json);
        } catch {
          issues.push(`Product '${label}': attributes_json is not valid JSON`);
        }
      }

      // Media presence for this SKU
      const mediaSet = mediaBySku.get(p.sku) || new Set<string>();
      if (mediaSet.size === 0) {
        issues.push(
          `Product '${label}': no Media rows found for SKU '${p.sku}'`
        );
      }

      // Hero image checks (required)
      if (!p.hero_image_filename) {
        issues.push(`Product '${label}': hero_image_filename is required`);
      } else {
        const hero = p.hero_image_filename.trim();
        if (!mediaSet.has(hero)) {
          issues.push(
            `Product '${label}': hero_image_filename '${hero}' not listed in Media sheet for SKU '${p.sku}'`
          );
        }
        if (!chosenFileMap.has(hero)) {
          issues.push(
            `Product '${label}': hero_image_filename '${hero}' was not among selected files to upload`
          );
        }
      }

      // OG image checks (optional)
      if (p.og_image_filename) {
        const og = p.og_image_filename.trim();
        if (!mediaSet.has(og)) {
          issues.push(
            `Product '${label}': og_image_filename '${og}' not listed in Media sheet for SKU '${p.sku}'`
          );
        }
        if (!chosenFileMap.has(og)) {
          issues.push(
            `Product '${label}': og_image_filename '${og}' was not among selected files to upload`
          );
        }
      }

      // Ensure all Media rows for this SKU exist among chosen files
      for (const fname of mediaSet) {
        if (!chosenFileMap.has(fname)) {
          issues.push(
            `SKU '${p.sku}': media filename '${fname}' listed in Media sheet but not among selected files`
          );
        }
      }

      // Number non-negative checks
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

      // Price relationships
      if (
        p.price != null &&
        p.compare_at_price != null &&
        Number(p.compare_at_price) < Number(p.price)
      ) {
        issues.push(`Product '${label}': compare_at_price must be ≥ price`);
      }
      if (p.sale_price != null) {
        if (p.compare_at_price == null) {
          issues.push(
            `Product '${label}': sale_price requires compare_at_price`
          );
        } else if (Number(p.sale_price) > Number(p.compare_at_price)) {
          issues.push(
            `Product '${label}': sale_price must be ≤ compare_at_price`
          );
        }
      }

      // Sale window validity
      if (p.sale_starts_at && p.sale_ends_at) {
        const start = new Date(p.sale_starts_at);
        const end = new Date(p.sale_ends_at);
        if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
          issues.push(
            `Product '${label}': sale_starts_at must be ≤ sale_ends_at (valid dates)`
          );
        }
      }

      // Featured rank rule
      if (
        asBool(p.is_featured) &&
        (p.featured_rank == null || Number(p.featured_rank) < 0)
      ) {
        issues.push(
          `Product '${label}': featured_rank must be a non-negative integer when is_featured is TRUE`
        );
      }

      // Progress (soft)
      if (i % 10 === 0) {
        setBulkProgress({
          phase: "validate",
          done: i + 1,
          total: bulkProducts.length,
        });
      }
    }

    setBulkIssues(issues);
    const ok = issues.length === 0;
    setBulkValidated(ok);
    setBulkProgress({
      phase: "validate",
      done: bulkProducts.length,
      total: bulkProducts.length,
    });
    return ok;
  };

  // ---- Upload images ----
  const bulkUploadImages = async () => {
    setBulkBusy(true);
    setBulkProgressMsg("Uploading images...");
    setBulkProgress(0);
    try {
      const taskMap = new Map<string, File>();
      for (const m of bulkMedia) {
        const f = bulkMediaFileMap.get(m.filename);
        if (f) taskMap.set(`${m.sku}/${m.filename}`, f);
      }
      const tasks = Array.from(taskMap.entries()).map(([key, file]) => ({
        key,
        file,
      }));
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
      toast.error(e.message || "Upload failed");
    } finally {
      setBulkProgressMsg("");
      setBulkBusy(false);
    }
  };

  // ---- Upsert DB ----
  const bulkUpsertAll = async (
    replaceProductImages?: boolean
  ): Promise<{ ok: boolean; issues: string[] }> => {
    const issues: string[] = [];
    setBulkIssues([]);
    setBulkProgress({ phase: "upsert", done: 0, total: bulkProducts.length });

    // 0) Preload dictionaries to resolve slugs -> ids
    const [[catRes, brRes]] = await Promise.all([
      Promise.all([
        supabase.from("categories").select("id,slug"),
        supabase.from("brands").select("id,slug"),
      ]),
    ]);
    const catMap = new Map<string, string>(
      (catRes.data ?? []).map((c: any) => [c.slug, c.id])
    );
    const brMap = new Map<string, string>(
      (brRes.data ?? []).map((b: any) => [b.slug, b.id])
    );
    let vendorId: string | null = null;
    try {
      const v = await getMyVendorOrThrow();
      vendorId = v.id;
    } catch (e: any) {
      issues.push(e?.message || "Vendor not approved");
      setBulkIssues(issues);
      return { ok: false, issues };
    }

    // 1) Group media by SKU for quick lookup
    type MediaRow = {
      sku?: string;
      filename?: string;
      alt?: string | null;
      sort_order?: number | null;
    };
    const mediaBySku = new Map<string, MediaRow[]>();
    for (const m of (bulkMedia ?? []) as MediaRow[]) {
      const sku = String(m.sku ?? "").trim();
      const filename = String(m.filename ?? "").trim();
      if (!sku || !filename) continue;
      const arr = mediaBySku.get(sku) ?? [];
      arr.push({
        sku,
        filename,
        alt: (m.alt ?? null) as any,
        sort_order: m.sort_order == null ? null : Number(m.sort_order),
      });
      mediaBySku.set(sku, arr);
    }

    // 2) Iterate products and upsert
    for (let i = 0; i < bulkProducts.length; i++) {
      const p = bulkProducts[i];
      const label = p.slug || p.sku || `row#${i + 2}`;

      const category_id = p.category_slug
        ? catMap.get(p.category_slug)
        : undefined;
      const brand_id = p.brand_slug ? brMap.get(p.brand_slug) : undefined;

      if (!category_id) {
        issues.push(
          `Upsert skipped '${label}': category '${p.category_slug}' not found`
        );
        continue;
      }
      if (!brand_id) {
        issues.push(
          `Upsert skipped '${label}': brand '${p.brand_slug}' not found`
        );
        continue;
      }

      const heroPath = p.hero_image_filename
        ? `${p.sku}/${p.hero_image_filename}`
        : null;
      const ogPath = p.og_image_filename
        ? `${p.sku}/${p.og_image_filename}`
        : null;

      // Build payload for products
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
        hero_image_path: heroPath,
        is_published: parseBool(p.is_published),

        vendor_id: vendorId,

        // promos / flags / seo
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

      // 2a) Upsert product
      const { data: prodRow, error: upErr } = await supabase
        .from("products")
        .upsert(payload, { onConflict: "slug" })
        .select("id")
        .single();

      if (upErr || !prodRow?.id) {
        issues.push(
          `Upsert failed '${label}': ${upErr?.message ?? "no id returned"}`
        );
        continue;
      }

      const product_id = prodRow.id as string;

      // 2b) Replace product_images if configured
      const replace =
        typeof replaceProductImages === "boolean"
          ? replaceProductImages
          : (typeof (window as any) !== "undefined" &&
              (window as any).bulkReplaceImages) ||
            (typeof bulkReplaceImages !== "undefined"
              ? bulkReplaceImages
              : true);

      if (replace) {
        const { error: delErr } = await supabase
          .from("product_images")
          .delete()
          .eq("product_id", product_id);
        if (delErr) {
          issues.push(`Images cleanup failed '${label}': ${delErr.message}`);
          // continue anyway; we'll try to insert
        }
      }

      // 2c) Insert product_images from Media sheet (sorted)
      const mediaRows = (mediaBySku.get(p.sku) || []).slice().sort((a, b) => {
        const aa = a.sort_order ?? 0,
          bb = b.sort_order ?? 0;
        return aa - bb;
      });

      if (mediaRows.length) {
        const rowsToInsert = mediaRows.map((m) => ({
          product_id,
          storage_path: `${p.sku}/${m.filename}`,
          alt: m.alt ?? null,
          sort_order: m.sort_order ?? 0,
        }));

        const { error: insErr } = await supabase
          .from("product_images")
          .insert(rowsToInsert);

        if (insErr) {
          issues.push(`Insert images failed '${label}': ${insErr.message}`);
        }
      } else {
        issues.push(`No media rows to insert for '${label}'`);
      }

      // Progress tick
      if (i % 5 === 0) {
        setBulkProgress({
          phase: "upsert",
          done: i + 1,
          total: bulkProducts.length,
        });
      }
    }

    setBulkProgress({
      phase: "upsert",
      done: bulkProducts.length,
      total: bulkProducts.length,
    });
    setBulkIssues(issues);
    return { ok: issues.length === 0, issues };
  };

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

  useEffect(() => {
    (async () => {
      try {
        const v = await getMyVendorOrThrow();
        setFormData((prev) => ({ ...prev, vendor_id: v.id }));
      } catch (e: any) {
        // If not approved, you might want to redirect or toast here.
      }
    })();
  }, []);

  // ---- UI ----
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Tabs
        defaultValue="basic"
        value={activeTab}
        onValueChange={setActiveTab}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="basic">Basic Info</TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
          <TabsTrigger value="bulk">Bulk Upload</TabsTrigger>
        </TabsList>

        <TabsContent value="basic" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Product Information</CardTitle>
              <CardDescription>
                Basic details mapped to your database
              </CardDescription>
            </CardHeader>

            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* LEFT */}
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="e.g., Skintectonic Soothing Sun Plus"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="slug">Slug *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="slug"
                      name="slug"
                      value={formData.slug}
                      onChange={handleChange}
                      placeholder="e.g., skintectonic-soothing-sun-plus"
                      required
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={generateHandle}
                    >
                      Generate
                    </Button>
                  </div>
                </div>

                <div>
                  <Label htmlFor="short_description">Short Description</Label>
                  <Textarea
                    id="short_description"
                    name="short_description"
                    value={formData.short_description}
                    onChange={handleChange}
                    rows={3}
                    placeholder="One-liner used in cards and list views"
                  />
                </div>

                <div>
                  <Label htmlFor="description">Description *</Label>
                  <Textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    rows={6}
                    placeholder="Full description for the product detail page"
                    required
                  />
                </div>
              </div>

              {/* RIGHT */}
              <div className="space-y-4">
                <div>
                  <Label htmlFor="sku">SKU *</Label>
                  <Input
                    id="sku"
                    name="sku"
                    value={formData.sku}
                    onChange={handleChange}
                    placeholder="e.g., ST-SSP-50"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="brand_id">Brand *</Label>
                  <Select
                    value={formData.brand_id}
                    onValueChange={(v) => handleSelectChange("brand_id", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select brand" />
                    </SelectTrigger>
                    <SelectContent>
                      {dbBrands.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}{" "}
                          {b.slug ? (
                            <span className="text-xs text-muted-foreground">
                              ({b.slug})
                            </span>
                          ) : null}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="category_id">Category *</Label>
                  <Select
                    value={formData.category_id}
                    onValueChange={(v) => handleSelectChange("category_id", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {dbCategories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}{" "}
                          {c.slug ? (
                            <span className="text-xs text-muted-foreground">
                              ({c.slug})
                            </span>
                          ) : null}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="country_of_origin">Country of Origin</Label>
                  <Input
                    id="country_of_origin"
                    name="country_of_origin"
                    value={formData.country_of_origin}
                    onChange={handleChange}
                    placeholder="e.g., Korea"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="volume_ml">Volume (ml)</Label>
                    <Input
                      id="volume_ml"
                      name="volume_ml"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.volume_ml}
                      onChange={handleChange}
                      placeholder="e.g., 50"
                    />
                  </div>
                  <div>
                    <Label htmlFor="net_weight_g">Net Weight (g)</Label>
                    <Input
                      id="net_weight_g"
                      name="net_weight_g"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.net_weight_g}
                      onChange={handleChange}
                      placeholder="e.g., 0"
                    />
                  </div>
                </div>

                <div className="space-y-2">
  <Label>Images</Label>

  {/* File picker */}
  <div className="flex flex-col gap-2">
    <input
      type="file"
      accept="image/*"
      multiple
      onChange={onSelectImages}
      className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground hover:file:opacity-90"
    />
    {imagePreviews.length > 0 && (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {imagePreviews.map((p) => (
          <div key={p.url} className="relative border rounded-lg overflow-hidden">
            <Image src={p.url} alt={p.file.name} width={300} height={300} className="h-28 w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 bg-black/50 text-[10px] text-white px-2 py-1 truncate">
              {p.file.name}
            </div>
          </div>
        ))}
      </div>
    )}

    <div className="flex items-center justify-between">
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={overwrite}
          onChange={(e) => setOverwrite(e.target.checked)}
        />
        Overwrite if file exists
      </label>

      <Button type="button" onClick={uploadSelectedImages} disabled={uploading}>
        {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
        {uploading ? "Uploading..." : "Upload Selected"}
      </Button>
    </div>
  </div>

  {/* Uploaded images list */}
  {uploadedImages.length > 0 && (
    <div className="mt-2 space-y-3">
      <div className="text-xs text-muted-foreground">
        Stored under <code>product-media/{formData.sku}/&lt;filename&gt;</code>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {uploadedImages
          .slice()
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((img, idx) => (
            <div key={img.storage_path} className="border rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs truncate">{img.storage_path}</div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setHero(img.storage_path)}
                    title="Set as hero"
                  >
                    {formData.hero_image_path === img.storage_path ? (
                      <Star className="h-4 w-4 text-yellow-500" />
                    ) : (
                      <StarOff className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeImage(img.storage_path)}
                    title="Remove image"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>

              {/* preview */}
              <div className="relative w-full h-40 overflow-hidden rounded-md mb-3 bg-muted">
                <Image
                  src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-media/${img.storage_path}`}
                  alt={img.alt || "product image"}
                  fill
                  className="object-cover"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Sort</Label>
                  <Input
                    type="number"
                    value={img.sort_order ?? idx}
                    onChange={(e) =>
                      setUploadedImages((prev) =>
                        prev.map((it) =>
                          it.storage_path === img.storage_path
                            ? { ...it, sort_order: Number(e.target.value) || 0 }
                            : it
                        )
                      )
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Alt</Label>
                  <Input
                    value={img.alt || ""}
                    onChange={(e) =>
                      setUploadedImages((prev) =>
                        prev.map((it) =>
                          it.storage_path === img.storage_path
                            ? { ...it, alt: e.target.value }
                            : it
                        )
                      )
                    }
                  />
                </div>
              </div>
            </div>
          ))}
      </div>
    </div>
  )}
</div>

              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pricing">
          <Card>
            <CardHeader>
              <CardTitle>Pricing</CardTitle>
              <CardDescription>
                Set price, compare-at price, and status
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <Label htmlFor="price">Price *</Label>
                <Input
                  id="price"
                  name="price"
                  type="number"
                  value={formData.price}
                  onChange={handleChange}
                  min="0"
                  step="0.01"
                  required
                />
              </div>

              <div>
                <Label htmlFor="compare_at_price">Compare at Price</Label>
                <Input
                  id="compare_at_price"
                  name="compare_at_price"
                  type="number"
                  value={formData.compare_at_price}
                  onChange={handleChange}
                  min="0"
                  step="0.01"
                />
              </div>

              <div>
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => handleSelectChange("status", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inventory">
          <Card>
            <CardHeader>
              <CardTitle>Inventory</CardTitle>
              <CardDescription>
                Manage SKU, barcode, and stock levels
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <Label htmlFor="sku">SKU</Label>
                <Input
                  id="sku"
                  name="sku"
                  value={formData.sku}
                  onChange={handleChange}
                  placeholder="e.g., COS-ASM-100"
                />
              </div>

              <div>
                <Label htmlFor="barcode">Barcode</Label>
                <Input
                  id="barcode"
                  name="barcode"
                  value={formData.barcode}
                  onChange={handleChange}
                  placeholder="Optional"
                />
              </div>

              <div>
                <Label htmlFor="inventory_qty">Inventory Quantity</Label>
                <Input
                  id="inventory_qty"
                  name="inventory_qty"
                  type="number"
                  value={formData.inventory_qty}
                  onChange={handleChange}
                  min="0"
                />
              </div>

              <div>
                <Label htmlFor="low_stock_threshold">Low Stock Threshold</Label>
                <Input
                  id="low_stock_threshold"
                  name="low_stock_threshold"
                  type="number"
                  value={formData.low_stock_threshold}
                  onChange={handleChange}
                  min="0"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="advanced" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Editorial Flags</CardTitle>
              <CardDescription>
                Feature this product in collections
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="trending">Trending</Label>
                <Switch
                  id="trending"
                  checked={formData.trending}
                  onCheckedChange={(v) => handleSwitchChange("trending", v)}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="bestseller">Bestseller</Label>
                <Switch
                  id="bestseller"
                  checked={formData.bestseller}
                  onCheckedChange={(v) => handleSwitchChange("bestseller", v)}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="new_arrival">New Arrival</Label>
                <Switch
                  id="new_arrival"
                  checked={formData.new_arrival}
                  onCheckedChange={(v) => handleSwitchChange("new_arrival", v)}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="featured">Featured</Label>
                <Switch
                  id="featured"
                  checked={formData.featured}
                  onCheckedChange={(v) => handleSwitchChange("featured", v)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>SEO</CardTitle>
              <CardDescription>
                Control how this product appears in search
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="seo_title">SEO Title</Label>
                <Input
                  id="seo_title"
                  name="seo_title"
                  value={formData.seo_title}
                  onChange={handleChange}
                  placeholder="Title tag"
                />
              </div>

              <div>
                <Label htmlFor="seo_description">SEO Description</Label>
                <Textarea
                  id="seo_description"
                  name="seo_description"
                  value={formData.seo_description}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Meta description for search results"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* BULK TAB */}
        <TabsContent value="bulk" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Bulk Upload — Template</CardTitle>
              <CardDescription>
                Download Excel template (includes your categories as hidden
                lookup).
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
        </TabsContent>
      </Tabs>

      {activeTab !== "bulk" && (
        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit">
            {product ? "Update Product" : "Create Product"}
          </Button>
        </div>
      )}
    </form>
  );
}
