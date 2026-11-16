/* תשתית חבילות. המחירים null = טרם נקבעו (לא ממציאים מחיר).
 * features: report | risk | valuation | compare | pdf | save | cloud
 * הזכאות בפועל מגיעה מהשרת (car_profiles.plan / credits) – כאן רק ההגדרה וההחלטה בצד הלקוח. */
import { ENFORCE_PLANS } from "./config.js";

export const PLANS = {
  free: {
    id: "free", name: "בדיקה חינמית", price: null, period: null,
    checksPerMonth: 3,
    features: ["report", "risk", "valuation", "save"],
    blurb: "דוח בסיסי מהמאגרים הממשלתיים, מדד סיכון והערכת מחיר"
  },
  single: {
    id: "single", name: "בדיקה מלאה לרכב", price: null, period: "one_time",
    credits: 1,
    features: ["report", "risk", "valuation", "save", "compare", "pdf", "cloud"],
    blurb: "כל הממצאים + דוח PDF להורדה ושמירה בענן"
  },
  pro: {
    id: "pro", name: "מנוי מקצועי (סוחרים / שמאים)", price: null, period: "monthly",
    checksPerMonth: null,
    features: ["report", "risk", "valuation", "save", "compare", "pdf", "cloud"],
    blurb: "בדיקות ללא הגבלה, השוואות ודוחות ממותגים"
  }
};

export const FEATURE_NAMES = {
  report: "דוח רכב", risk: "מדד סיכון", valuation: "הערכת שווי", compare: "השוואת רכבים",
  pdf: "דוח PDF", save: "שמירת בדיקות", cloud: "סנכרון לענן"
};

export function can(feature, profile){
  if (!ENFORCE_PLANS) return true;
  const plan = PLANS[(profile && profile.plan) || "free"] || PLANS.free;
  if (!plan.features.includes(feature)) return false;
  if (plan.id === "single") return (profile.credits || 0) > 0;
  return true;
}

export const priceLabel = p => p.price == null ? "מחיר ייקבע" : `₪ ${p.price}${p.period === "monthly" ? " לחודש" : ""}`;
