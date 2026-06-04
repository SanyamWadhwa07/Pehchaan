import warnings
warnings.filterwarnings("ignore")
import os
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
import tensorflow as tf

interp = tf.lite.Interpreter("D:/Pehchaan/ml/models/blazeface.tflite")
interp.allocate_tensors()
print("=== BlazeFace inputs ===")
for d in interp.get_input_details():
    print("  [" + str(d["index"]) + "] " + d["name"] + "  shape=" + str(d["shape"]) + "  dtype=" + str(d["dtype"]))
print("=== BlazeFace outputs ===")
for d in interp.get_output_details():
    print("  [" + str(d["index"]) + "] " + d["name"] + "  shape=" + str(d["shape"]) + "  dtype=" + str(d["dtype"]))
