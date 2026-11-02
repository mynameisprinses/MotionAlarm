export interface MovementAlert {
  id: string;
  createdAt: string;
  source: 'Movement' | 'Test';
  status: 'New' | 'Reviewed';
  strength: number | null;
}
