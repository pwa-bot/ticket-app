export default function ComparisonSection() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-16">
      <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Built for the agent era.</h2>
      <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="border-b border-slate-200 px-4 py-3 font-medium">Linear</th>
              <th className="border-b border-slate-200 px-4 py-3 font-medium">GitHub Issues</th>
              <th className="border-b border-slate-200 px-4 py-3 font-medium">Ticket</th>
            </tr>
          </thead>
          <tbody className="text-slate-700">
            <tr>
              <td className="border-b border-slate-200 px-4 py-3">Great UI, wrong billing for agents</td>
              <td className="border-b border-slate-200 px-4 py-3">Repo-native but not agent-first</td>
              <td className="border-b border-slate-200 px-4 py-3">Repo-native + agent-grade CLI</td>
            </tr>
            <tr>
              <td className="px-4 py-3">Seats get expensive with bots</td>
              <td className="px-4 py-3">Specs feel bolted on</td>
              <td className="px-4 py-3">No per-seat fees</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
