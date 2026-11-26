import type { Metadata } from "next";
import Link from "next/link";
import { CellarView } from "@/components/CellarView";

export const metadata: Metadata = { title: "My cellar" };

export default function CellarPage() {
  return (
    <div className="flex flex-col gap-12">
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4 border-b-2 border-ink pb-6">
        <h1 className="text-4xl sm:text-5xl">My cellar</h1>
        <Link href="/open" className="btn btn-secondary">
          Open another barrel
        </Link>
      </div>
      <CellarView />
    </div>
  );
}
