import { requireUser } from "@/lib/auth/session";
import { getExplorerTree } from "@/lib/customers/queries";

// What the tree on the left shows. The tree lives in the layout, which is not
// rendered again on every navigation, so it asks for itself when the page or
// the map changes. `?customer=<id>` also lists that customer's devices.
export async function GET(request: Request) {
  await requireUser();
  const customerId = new URL(request.url).searchParams.get("customer");
  const tree = await getExplorerTree(customerId);
  return Response.json(tree, { headers: { "Cache-Control": "no-store" } });
}
