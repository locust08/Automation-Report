import type { SVGAttributes } from "react";

const AuthBackgroundShape = (props: SVGAttributes<SVGElement>) => (
  <svg width="760" height="720" viewBox="0 0 760 720" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M590 58c83 57 108 170 55 256L363 630c-53 86-166 112-252 59S-1 523 52 437L334 121C387 35 504 1 590 58Z" stroke="currentColor" strokeOpacity=".22" strokeWidth="2" strokeDasharray="9 10" />
    <path d="M548 91c68 47 88 139 44 209L340 582c-44 70-136 91-206 47S43 493 87 423L339 141c44-70 139-97 209-50Z" fill="currentColor" fillOpacity=".08" />
    <path d="M548 91c68 47 88 139 44 209L340 582c-44 70-136 91-206 47S43 493 87 423L339 141c44-70 139-97 209-50Z" stroke="currentColor" strokeOpacity=".15" />
  </svg>
);

export default AuthBackgroundShape;
