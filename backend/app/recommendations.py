CATEGORY_ACTIONS = {
    'Teaching Quality': 'Review teaching methods, classroom delivery, and instructor engagement for targeted improvement.',
    'Course Content': 'Audit curricular relevance, assign updated reading material, and strengthen industry-aligned topics.',
    'Infrastructure': 'Inspect campus facilities, maintenance logs, and service reliability for urgent operational fixes.',
    'Laboratory': 'Check equipment availability, lab access, software readiness, and maintenance scheduling.',
    'Examination': 'Review exam scheduling, question clarity, assessment fairness, and evaluation procedures.',
    'Placement': 'Evaluate placement support, recruiter engagement, soft-skills training, and internship preparation.',
    'Hostel': 'Examine accommodation quality, access, maintenance, and resident support practices.',
    'Administration': 'Investigate service delays, procedural bottlenecks, and communication gaps in administrative workflows.',
    'Positive Feedback': 'Identify good practices worth retaining and scaling across departments.',
    'Negative Feedback': 'Trace the root cause behind recurring complaints and verify the real operational issue before acting.',
    'Suggestions': 'Assess the proposed idea for feasibility, cost, and institutional fit before implementation.',
}


def build_recommendation(category: str) -> str:
    return CATEGORY_ACTIONS.get(category, 'Review the issue with stakeholders and confirm the underlying concern before action.')
