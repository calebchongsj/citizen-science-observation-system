import { Tag } from './Tag';
import { formatWalkStatus, getWalkStatusTagVariant } from '../lib/walkStatus';

type StatusTagProps = {
  status: string;
};

export function StatusTag({ status }: StatusTagProps) {
  return (
    <Tag variant={getWalkStatusTagVariant(status)}>{formatWalkStatus(status)}</Tag>
  );
}
