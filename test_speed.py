import torch
import time
from ultralytics import YOLO
import numpy as np

def benchmark_speed(model_name='yolov8n.pt', img_size=640, iterations=100):
    """
    Benchmarks the inference speed of a YOLOv8 model on the CPU.
    
    Args:
        model_name (str): The name of the model file (e.g., 'yolov8n.pt').
        img_size (int): The size of the input image.
        iterations (int): The number of inferences to average over.
    """
    # Check for device
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f"Using device: {device}")
    
    # Load the YOLOv8 model
    print(f"Loading model: {model_name}...")
    try:
        model = YOLO(model_name)
    except Exception as e:
        print(f"Error loading model: {e}")
        return

    # Move model to the appropriate device
    model.to(device)

    # Create a dummy image for inference
    # A random tensor is used to ensure the test is purely about model processing speed
    # and not affected by image loading time from disk.
    dummy_image = torch.rand(1, 3, img_size, img_size).to(device)
    
    # --- Warm-up run ---
    # The first inference is often slower due to model loading, memory allocation, etc.
    # We run it once to "warm up" the system for accurate benchmarking.
    print("Performing a warm-up inference run...")
    model(dummy_image, verbose=False)
    
    # --- Benchmarking ---
    print(f"Starting benchmark with {iterations} iterations...")
    timings = []
    for i in range(iterations):
        start_time = time.perf_counter()
        
        # Run inference
        _ = model(dummy_image, verbose=False)
        
        end_time = time.perf_counter()
        
        # Append the time taken for this single inference
        timings.append(end_time - start_time)
        
    # --- Calculate and Print Results ---
    total_time = sum(timings)
    avg_time_per_inference = np.mean(timings)
    fps = 1 / avg_time_per_inference
    
    print("\n--- Benchmark Results ---")
    print(f"Total time for {iterations} inferences: {total_time:.4f} seconds")
    print(f"Average time per inference: {avg_time_per_inference*1000:.2f} ms")
    print(f"Inferences per second (FPS): {fps:.2f}")
    print("-------------------------\n")


if __name__ == '__main__':
    # You can change the model name and other parameters here
    benchmark_speed(model_name='yolov8n.pt', img_size=640, iterations=100)