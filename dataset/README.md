# Dataset documentation

The dataset is a local institutional feedback corpus intended for academic use and classroom demonstration. The required column names are:

- `feedback` or `text`: raw student feedback text
- `category`: one of the 11 labels in the project taxonomy

Files included:

- `edupulse_student_feedback_additional_1000_long.csv`: 1,000-row development dataset
- `edupulse_student_feedback_500_long.csv`: 500-row independent validation dataset

Training compares the candidate classifiers on the independent 500-row dataset, then fits the selected model on the combined 1,500 rows. The saved evaluation report records the independent validation results separately from the combined-data split comparison. The public benchmark is not a substitute for a full institutional annotation pipeline, and the project clearly separates model-generated output from verified administrative action.
