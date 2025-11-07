import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const search = url.search ?? "";
  return redirect(`/app${search}`);
}

export default function IndexRedirect() {
  return null;
}
