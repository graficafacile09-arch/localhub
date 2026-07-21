import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type BackLinkProps = {
  href: string;
  label: string;
};

export default function BackLink({ href, label }: BackLinkProps) {
  return (
    <Link
      href={href}
      className="mb-8 inline-flex items-center gap-2 rounded-full border border-blue-600 px-5 py-2 text-blue-600 font-semibold hover:bg-blue-600 hover:text-white transition"
    >
      <ArrowLeft className="w-5 h-5" />
      {label}
    </Link>
  );
}
