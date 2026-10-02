import { PageMeta } from '@/components/common/PageMeta';
import { MainContentArea } from '@/components/layout/MainContentArea';
import { ComingSoonPlaceholder } from '@/components/common/ComingSoonPlaceholder';

export default function MonthlySummaryPage() {
  return (
    <MainContentArea>
      <PageMeta title="Monthly Summary" description="Monthly occupancy, revenue, and collection reports." />
      <ComingSoonPlaceholder
        icon="chart"
        title="Monthly Summary"
      />
    </MainContentArea>
  );
}
