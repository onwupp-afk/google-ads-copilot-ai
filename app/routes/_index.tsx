import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const search = url.searchParams.toString();
  const suffix = search.length ? `?${search}` : "";
  return redirect(`/app${suffix}`);
}

export default function IndexRedirect() {
  return null;
}
