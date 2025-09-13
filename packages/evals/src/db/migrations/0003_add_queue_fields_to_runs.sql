-- Add status and queuePosition fields to runs table
ALTER TABLE runs 
ADD COLUMN status TEXT DEFAULT 'queued' NOT NULL,
ADD COLUMN queue_position INTEGER;

-- Update existing runs to have 'completed' status
UPDATE runs 
SET status = 'completed' 
WHERE passed > 0 OR failed > 0;

-- Add index for status field for better query performance
CREATE INDEX idx_runs_status ON runs(status);
CREATE INDEX idx_runs_queue_position ON runs(queue_position);