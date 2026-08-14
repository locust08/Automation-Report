import Image from "next/image";

import { cn } from "@/lib/utils";

const Logo = ({ className }: { className?: string }) => (
  <div className={cn("flex items-center gap-3", className)}>
    <Image src="/locus-t-logo-25.png" alt="LOCUS-T" width={190} height={42} className="h-10 w-auto object-contain" priority />
  </div>
);

export default Logo;
