import {Suspense} from "react";
import AdvisoryWorkspace from "@/components/advisory/AdvisoryWorkspace";
export default function Page(){return <Suspense fallback={<p className="p-6">Opening advisory workspace…</p>}><AdvisoryWorkspace/></Suspense>}
