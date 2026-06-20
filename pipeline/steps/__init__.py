# Pipeline steps. Each module exposes ONE function with a clear contract
# (inputs/outputs as file paths). run_pipeline.py wires them together in order:
#
#   make_prompt      description:str                  -> prompt:str          [P3]
#   generate_video   prompt, image_paths, out_path    -> video_path:str      [P3]
#   extract_frames   video_path, frames_dir           -> frames_dir:str      [P3]
#   run_colmap       frames_dir, work_dir             -> colmap_dir:str      [P4]
#   train_gsplat     frames_dir, colmap_dir, out_dir  -> model_path:str      [P4]
#   export_splat     model_path, out_path             -> splat_path:str      [P4]
