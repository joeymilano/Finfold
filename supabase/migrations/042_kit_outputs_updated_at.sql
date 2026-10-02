-- 042: kit_outputs.updated_at
--
-- 2026-07-21 生产事故：编辑保存接口（PUT /api/kits/[kitId]/outputs/[outputId]）
-- 每次 UPDATE 都写入 updated_at，但 kit_outputs 表是迁移体系建立之前手工
-- 创建的，从来没有 updated_at 列 —— PostgREST 42703
-- "column kit_outputs.updated_at does not exist"，
-- 前端因此始终报 "Failed to save your edit. Please try again."。
-- SELECT 路径不引用该列，所以读取正常，只有写入失败。
--
-- 回填用 created_at（比 now() 更接近真实的“最后修改时间”语义：这些行自
-- 创建后从未被成功 UPDATE 过 —— 该 bug 从编辑功能上线起就存在）。

ALTER TABLE public.kit_outputs
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE public.kit_outputs
  SET updated_at = created_at
  WHERE updated_at IS NULL;

ALTER TABLE public.kit_outputs
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now();
