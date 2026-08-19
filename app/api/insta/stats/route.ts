import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { brandNames, statsForBrand } from "@/lib/insta";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const brand = searchParams.get("brand");
  if (!brand) return NextResponse.json({ brands: brandNames() });
  return NextResponse.json(await statsForBrand(brand));
}
