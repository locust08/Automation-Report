import AuthBackgroundShape from "@/assets/svg/auth-background-shape";
import LoginForm from "@/components/shadcn-studio/blocks/login-page-01/login-form";
import Logo from "@/components/shadcn-studio/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const Login = () => (
  <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f0f0f0] px-4 py-10 sm:px-6 lg:px-8">
    <div className="absolute inset-x-0 top-0 h-2 bg-red-600" />
    <div className="absolute -right-36 -top-24 text-red-700 sm:right-[-4rem]" aria-hidden="true"><AuthBackgroundShape className="h-[680px] w-[720px]" /></div>
    <div className="absolute -bottom-64 -left-52 size-[540px] rounded-full bg-red-600/10 blur-3xl" aria-hidden="true" />

    <Card className="z-10 w-full gap-0 overflow-hidden rounded-[2rem] border border-neutral-200 bg-white/95 py-0 shadow-[0_24px_80px_rgba(62,21,25,0.16)] backdrop-blur sm:max-w-lg">
      <div className="h-2 bg-gradient-to-r from-[#8f0610] via-red-600 to-[#df2b35]" />
      <CardHeader className="gap-6 px-6 pb-5 pt-8 sm:px-9 sm:pt-9">
        <Logo />
        <div>
          <CardTitle className="mb-2 text-3xl font-semibold tracking-tight text-neutral-950">Welcome back</CardTitle>
          <CardDescription className="text-base leading-relaxed text-neutral-600">Login to access</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="px-6 pb-8 sm:px-9 sm:pb-9">
        <div className="space-y-5">
          <LoginForm />
          <p className="text-center text-sm text-neutral-500">Access is limited to locus-t.com.my and digitalbee.ai accounts.</p>
        </div>
      </CardContent>
    </Card>
  </main>
);

export default Login;
