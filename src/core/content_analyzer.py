"""Content analysis module for readability scores and keyword density."""
import re
from collections import Counter
import math

class ContentAnalyzer:
    """Analyzes text content for readability, keywords, and quality metrics."""
    
    def __init__(self):
        # Common stop words to exclude from keyword analysis
        self.stop_words = {
            'a', 'an', 'the', 'and', 'or', 'but', 'if', 'because', 'as', 'what',
            'when', 'where', 'how', 'who', 'whom', 'which', 'this', 'that', 'these',
            'those', 'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing',
            'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
            'my', 'your', 'his', 'its', 'our', 'their', 'mine', 'yours', 'hers', 'ours', 'theirs',
            'in', 'on', 'at', 'to', 'from', 'by', 'for', 'with', 'about', 'against', 'between',
            'into', 'through', 'during', 'before', 'after', 'above', 'below', 'under', 'over'
        }

    def analyze_content(self, text):
        """
        Analyze text content and return metrics.
        
        Args:
            text (str): The plain text content to analyze
            
        Returns:
            dict: Content metrics (readability, keyword density, etc.)
        """
        if not text or not text.strip():
            return self._get_empty_result()
            
        # Basic stats
        word_count = self._count_words(text)
        sentence_count = self._count_sentences(text)
        syllable_count = self._count_syllables(text)
        
        # Avoid division by zero
        if word_count == 0 or sentence_count == 0:
            return self._get_empty_result()
            
        # Calculate readability scores
        flesch_kincaid = self._calculate_flesch_kincaid(word_count, sentence_count, syllable_count)
        gunning_fog = self._calculate_gunning_fog(text, word_count, sentence_count)
        
        # Keyword analysis
        keywords = self._extract_keywords(text)
        
        return {
            'word_count': word_count,
            'sentence_count': sentence_count,
            'readability_score': flesch_kincaid,
            'flesch_kincaid_grade': self._calculate_flesch_kincaid_grade(word_count, sentence_count, syllable_count),
            'gunning_fog_index': gunning_fog,
            'reading_time_minutes': math.ceil(word_count / 200),  # Avg reading speed 200 wpm
            'keywords': keywords,
            'is_thin_content': word_count < 300  # Default threshold
        }

    def _get_empty_result(self):
        """Return empty result structure."""
        return {
            'word_count': 0,
            'sentence_count': 0,
            'readability_score': 0,
            'flesch_kincaid_grade': 0,
            'gunning_fog_index': 0,
            'reading_time_minutes': 0,
            'keywords': [],
            'is_thin_content': True
        }

    def _count_words(self, text):
        """Count words in text."""
        # Simple regex for word tokenization
        words = re.findall(r'\b\w+\b', text.lower())
        return len(words)

    def _count_sentences(self, text):
        """Count sentences in text."""
        # Split by ., !, ? followed by space or end of string
        sentences = re.split(r'[.!?]+(?:\s+|$)', text)
        # Filter empty strings from split
        return len([s for s in sentences if s.strip()])

    def _count_syllables(self, text):
        """Estimate syllable count for the entire text."""
        words = re.findall(r'\b\w+\b', text.lower())
        count = 0
        for word in words:
            count += self._count_syllables_in_word(word)
        return count

    def _count_syllables_in_word(self, word):
        """Heuristic to count syllables in a word."""
        word = word.lower()
        if len(word) <= 3:
            return 1
            
        # Remove silent e at end
        if word.endswith('e'):
            word = word[:-1]
            
        # Count vowel groups
        vowels = "aeiouy"
        count = 0
        prev_is_vowel = False
        
        for char in word:
            is_vowel = char in vowels
            if is_vowel and not prev_is_vowel:
                count += 1
            prev_is_vowel = is_vowel
            
        return max(1, count)

    def _count_complex_words(self, text):
        """Count words with 3 or more syllables (for Gunning Fog)."""
        words = re.findall(r'\b\w+\b', text.lower())
        count = 0
        for word in words:
            if self._count_syllables_in_word(word) >= 3:
                count += 1
        return count

    def _calculate_flesch_kincaid(self, total_words, total_sentences, total_syllables):
        """
        Calculate Flesch Reading Ease score.
        Formula: 206.835 - 1.015 * (total_words / total_sentences) - 84.6 * (total_syllables / total_words)
        """
        if total_words == 0 or total_sentences == 0:
            return 0
            
        score = 206.835 - 1.015 * (total_words / total_sentences) - 84.6 * (total_syllables / total_words)
        return round(max(0, min(100, score)), 1)

    def _calculate_flesch_kincaid_grade(self, total_words, total_sentences, total_syllables):
        """
        Calculate Flesch-Kincaid Grade Level.
        Formula: 0.39 * (total_words / total_sentences) + 11.8 * (total_syllables / total_words) - 15.59
        """
        if total_words == 0 or total_sentences == 0:
            return 0
            
        grade = 0.39 * (total_words / total_sentences) + 11.8 * (total_syllables / total_words) - 15.59
        return round(max(0, grade), 1)

    def _calculate_gunning_fog(self, text, total_words, total_sentences):
        """
        Calculate Gunning Fog Index.
        Formula: 0.4 * ((total_words / total_sentences) + 100 * (complex_words / total_words))
        """
        if total_words == 0 or total_sentences == 0:
            return 0
            
        complex_words = self._count_complex_words(text)
        grade = 0.4 * ((total_words / total_sentences) + 100 * (complex_words / total_words))
        return round(max(0, grade), 1)
        
    def _extract_keywords(self, text, top_n=20):
        """Extract top keywords based on term frequency."""
        words = re.findall(r'\b\w+\b', text.lower())
        # Filter stop words and short words
        filtered_words = [
            w for w in words 
            if w not in self.stop_words and len(w) > 2 and not w.isdigit()
        ]
        
        counter = Counter(filtered_words)
        total_filtered_words = len(filtered_words)
        
        if total_filtered_words == 0:
            return []
            
        keywords = []
        for word, count in counter.most_common(top_n):
            density = (count / total_filtered_words) * 100
            keywords.append({
                'word': word,
                'count': count,
                'density': round(density, 2)
            })
            
        return keywords
