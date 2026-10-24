from app.training import train_and_evaluate

if __name__ == '__main__':
    bundle = train_and_evaluate(force_retrain=True)
    print(f"Selected model: {bundle['selected_model_name']}")
    print(f"Accuracy: {bundle['metrics']['metrics']['accuracy']:.4f}")
    print(f"Macro F1: {bundle['metrics']['metrics']['macro_f1']:.4f}")
