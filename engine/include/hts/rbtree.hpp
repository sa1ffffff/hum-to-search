// Red-black tree: a self-balancing binary search tree.
//
// Invariants (checked by validate()):
//   1. every node is red or black;      2. the root is black;
//   3. nil leaves are black;            4. a red node has two black children;
//   5. every root-to-nil path crosses the same number of black nodes.
// Together they bound the height by 2·log2(n + 1), so insert, erase and find
// are O(log n). Insertion repairs at most 2 rotations; erasure at most 3; both
// may recolour O(log n) nodes. In-order traversal is O(n), and reading the
// first k keys is O(log n + k).
//
// The implementation follows CLRS (3rd ed., ch. 13) with a shared black
// sentinel standing in for every nil leaf, which removes most null checks from
// the fix-up code. Rotation and recolour counts are kept so the interface can
// show how much rebalancing each update cost.
#pragma once

#include <cstddef>
#include <cstdint>
#include <functional>
#include <utility>
#include <vector>

namespace hts {

struct RbCounters {
  std::uint64_t rotations = 0;
  std::uint64_t recolors = 0;
  std::uint64_t inserts = 0;
  std::uint64_t erases = 0;
};

template <typename Key, typename Less = std::less<Key>>
class RedBlackTree {
 public:
  enum class Color : std::uint8_t { Red, Black };

  struct SnapshotNode {
    Key key;
    bool red;
    std::int32_t left;   // index into the snapshot, −1 for nil
    std::int32_t right;
  };

  explicit RedBlackTree(Less less = Less()) : less_(less) {
    nil_ = new Node();
    nil_->color = Color::Black;
    nil_->left = nil_->right = nil_->parent = nil_;
    root_ = nil_;
  }

  ~RedBlackTree() {
    destroy(root_);
    delete nil_;
  }

  RedBlackTree(const RedBlackTree&) = delete;
  RedBlackTree& operator=(const RedBlackTree&) = delete;

  // Moving transfers the nodes; the source keeps a fresh sentinel and is empty.
  RedBlackTree(RedBlackTree&& other) noexcept
      : nil_(other.nil_), root_(other.root_), size_(other.size_), less_(other.less_),
        counters_(other.counters_) {
    other.nil_ = new Node();
    other.nil_->left = other.nil_->right = other.nil_->parent = other.nil_;
    other.root_ = other.nil_;
    other.size_ = 0;
  }

  RedBlackTree& operator=(RedBlackTree&& other) noexcept {
    if (this != &other) {
      std::swap(nil_, other.nil_);
      std::swap(root_, other.root_);
      std::swap(size_, other.size_);
      std::swap(less_, other.less_);
      std::swap(counters_, other.counters_);
    }
    return *this;
  }

  std::size_t size() const { return size_; }
  bool empty() const { return size_ == 0; }
  const RbCounters& counters() const { return counters_; }

  void clear() {
    destroy(root_);
    root_ = nil_;
    size_ = 0;
  }

  bool contains(const Key& key) const { return find(key) != nil_; }

  // Inserts `key`; returns false if an equivalent key is already present.
  bool insert(const Key& key) {
    Node* parent = nil_;
    Node* cursor = root_;
    while (cursor != nil_) {
      parent = cursor;
      if (less_(key, cursor->key)) cursor = cursor->left;
      else if (less_(cursor->key, key)) cursor = cursor->right;
      else return false;
    }

    Node* z = new Node();
    z->key = key;
    z->color = Color::Red;
    z->left = z->right = nil_;
    z->parent = parent;
    if (parent == nil_) root_ = z;
    else if (less_(key, parent->key)) parent->left = z;
    else parent->right = z;

    insertFixup(z);
    ++size_;
    ++counters_.inserts;
    return true;
  }

  // Removes `key`; returns false if it was not present.
  bool erase(const Key& key) {
    Node* z = find(key);
    if (z == nil_) return false;

    Node* y = z;
    Color removedColor = y->color;
    Node* x = nil_;
    if (z->left == nil_) {
      x = z->right;
      transplant(z, z->right);
    } else if (z->right == nil_) {
      x = z->left;
      transplant(z, z->left);
    } else {
      y = minimum(z->right);
      removedColor = y->color;
      x = y->right;
      if (y->parent == z) {
        x->parent = y;  // x may be the sentinel; fix-up relies on its parent
      } else {
        transplant(y, y->right);
        y->right = z->right;
        y->right->parent = y;
      }
      transplant(z, y);
      y->left = z->left;
      y->left->parent = y;
      if (y->color != z->color) ++counters_.recolors;
      y->color = z->color;
    }
    delete z;
    if (removedColor == Color::Black) eraseFixup(x);
    nil_->parent = nil_;
    --size_;
    ++counters_.erases;
    return true;
  }

  // Visits keys in ascending order (per `Less`) until `visit` returns false.
  template <typename Visitor>
  void forEach(Visitor visit) const {
    // Iterative in-order walk so a large tree never deepens the call stack.
    std::vector<const Node*> stack;
    const Node* cursor = root_;
    while (cursor != nil_ || !stack.empty()) {
      while (cursor != nil_) {
        stack.push_back(cursor);
        cursor = cursor->left;
      }
      cursor = stack.back();
      stack.pop_back();
      if (!visit(cursor->key)) return;
      cursor = cursor->right;
    }
  }

  // Height in nodes (0 for an empty tree).
  int height() const { return heightOf(root_); }

  // Returns the black height if every invariant holds, −1 otherwise.
  int validate() const {
    if (root_->color != Color::Black && root_ != nil_) return -1;
    if (nil_->color != Color::Black) return -1;
    std::size_t counted = 0;
    const int bh = validateFrom(root_, counted);
    return counted == size_ ? bh : -1;
  }

  // Flattens the tree for drawing: nodes in pre-order, root at index 0.
  std::vector<SnapshotNode> snapshot() const {
    std::vector<SnapshotNode> out;
    out.reserve(size_);
    snapshotFrom(root_, out);
    return out;
  }

 private:
  struct Node {
    Key key{};
    Color color = Color::Black;
    Node* left = nullptr;
    Node* right = nullptr;
    Node* parent = nullptr;
  };

  Node* find(const Key& key) const {
    Node* cursor = root_;
    while (cursor != nil_) {
      if (less_(key, cursor->key)) cursor = cursor->left;
      else if (less_(cursor->key, key)) cursor = cursor->right;
      else return cursor;
    }
    return nil_;
  }

  Node* minimum(Node* node) const {
    while (node->left != nil_) node = node->left;
    return node;
  }

  void recolor(Node* node, Color color) {
    if (node->color != color) {
      node->color = color;
      ++counters_.recolors;
    }
  }

  void rotateLeft(Node* x) {
    Node* y = x->right;
    x->right = y->left;
    if (y->left != nil_) y->left->parent = x;
    y->parent = x->parent;
    if (x->parent == nil_) root_ = y;
    else if (x == x->parent->left) x->parent->left = y;
    else x->parent->right = y;
    y->left = x;
    x->parent = y;
    ++counters_.rotations;
  }

  void rotateRight(Node* x) {
    Node* y = x->left;
    x->left = y->right;
    if (y->right != nil_) y->right->parent = x;
    y->parent = x->parent;
    if (x->parent == nil_) root_ = y;
    else if (x == x->parent->right) x->parent->right = y;
    else x->parent->left = y;
    y->right = x;
    x->parent = y;
    ++counters_.rotations;
  }

  void insertFixup(Node* z) {
    while (z->parent->color == Color::Red) {
      Node* grand = z->parent->parent;
      if (z->parent == grand->left) {
        Node* uncle = grand->right;
        if (uncle->color == Color::Red) {          // case 1: recolour, move up
          recolor(z->parent, Color::Black);
          recolor(uncle, Color::Black);
          recolor(grand, Color::Red);
          z = grand;
        } else {
          if (z == z->parent->right) {             // case 2: rotate into case 3
            z = z->parent;
            rotateLeft(z);
          }
          recolor(z->parent, Color::Black);        // case 3: rotate grandparent
          recolor(z->parent->parent, Color::Red);
          rotateRight(z->parent->parent);
        }
      } else {
        Node* uncle = grand->left;
        if (uncle->color == Color::Red) {
          recolor(z->parent, Color::Black);
          recolor(uncle, Color::Black);
          recolor(grand, Color::Red);
          z = grand;
        } else {
          if (z == z->parent->left) {
            z = z->parent;
            rotateRight(z);
          }
          recolor(z->parent, Color::Black);
          recolor(z->parent->parent, Color::Red);
          rotateLeft(z->parent->parent);
        }
      }
    }
    recolor(root_, Color::Black);
  }

  void transplant(Node* u, Node* v) {
    if (u->parent == nil_) root_ = v;
    else if (u == u->parent->left) u->parent->left = v;
    else u->parent->right = v;
    v->parent = u->parent;
  }

  void eraseFixup(Node* x) {
    while (x != root_ && x->color == Color::Black) {
      if (x == x->parent->left) {
        Node* w = x->parent->right;
        if (w->color == Color::Red) {                                    // case 1
          recolor(w, Color::Black);
          recolor(x->parent, Color::Red);
          rotateLeft(x->parent);
          w = x->parent->right;
        }
        if (w->left->color == Color::Black && w->right->color == Color::Black) {  // case 2
          recolor(w, Color::Red);
          x = x->parent;
        } else {
          if (w->right->color == Color::Black) {                         // case 3
            recolor(w->left, Color::Black);
            recolor(w, Color::Red);
            rotateRight(w);
            w = x->parent->right;
          }
          recolor(w, x->parent->color);                                  // case 4
          recolor(x->parent, Color::Black);
          recolor(w->right, Color::Black);
          rotateLeft(x->parent);
          x = root_;
        }
      } else {
        Node* w = x->parent->left;
        if (w->color == Color::Red) {
          recolor(w, Color::Black);
          recolor(x->parent, Color::Red);
          rotateRight(x->parent);
          w = x->parent->left;
        }
        if (w->right->color == Color::Black && w->left->color == Color::Black) {
          recolor(w, Color::Red);
          x = x->parent;
        } else {
          if (w->left->color == Color::Black) {
            recolor(w->right, Color::Black);
            recolor(w, Color::Red);
            rotateLeft(w);
            w = x->parent->left;
          }
          recolor(w, x->parent->color);
          recolor(x->parent, Color::Black);
          recolor(w->left, Color::Black);
          rotateRight(x->parent);
          x = root_;
        }
      }
    }
    recolor(x, Color::Black);
  }

  void destroy(Node* node) {
    // Iterative to keep deep trees off the call stack.
    std::vector<Node*> stack;
    if (node != nil_) stack.push_back(node);
    while (!stack.empty()) {
      Node* n = stack.back();
      stack.pop_back();
      if (n->left != nil_) stack.push_back(n->left);
      if (n->right != nil_) stack.push_back(n->right);
      delete n;
    }
  }

  int heightOf(const Node* node) const {
    if (node == nil_) return 0;
    const int l = heightOf(node->left);
    const int r = heightOf(node->right);
    return 1 + (l > r ? l : r);
  }

  int validateFrom(const Node* node, std::size_t& counted) const {
    if (node == nil_) return 1;
    ++counted;
    if (node->color == Color::Red &&
        (node->left->color == Color::Red || node->right->color == Color::Red)) {
      return -1;
    }
    if (node->left != nil_ && (node->left->parent != node || !less_(node->left->key, node->key))) return -1;
    if (node->right != nil_ && (node->right->parent != node || !less_(node->key, node->right->key))) return -1;
    const int l = validateFrom(node->left, counted);
    const int r = validateFrom(node->right, counted);
    if (l < 0 || r < 0 || l != r) return -1;
    return l + (node->color == Color::Black ? 1 : 0);
  }

  std::int32_t snapshotFrom(const Node* node, std::vector<SnapshotNode>& out) const {
    if (node == nil_) return -1;
    const auto index = static_cast<std::int32_t>(out.size());
    out.push_back(SnapshotNode{node->key, node->color == Color::Red, -1, -1});
    const std::int32_t l = snapshotFrom(node->left, out);
    const std::int32_t r = snapshotFrom(node->right, out);
    out[static_cast<std::size_t>(index)].left = l;
    out[static_cast<std::size_t>(index)].right = r;
    return index;
  }

  Node* nil_ = nullptr;
  Node* root_ = nullptr;
  std::size_t size_ = 0;
  Less less_;
  RbCounters counters_;
};

}  // namespace hts
