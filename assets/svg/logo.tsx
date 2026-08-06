import type { SVGAttributes } from "react";

const Logo = (props: SVGAttributes<SVGElement>) => (
  <svg width="42" height="42" viewBox="0 0 42 42" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <rect width="42" height="42" rx="12" fill="currentColor" />
    <path d="M12 10v17c0 3 2 5 5 5h13" stroke="white" strokeWidth="4" strokeLinecap="round" />
    <path d="m24 12 6 6-6 6" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default Logo;
